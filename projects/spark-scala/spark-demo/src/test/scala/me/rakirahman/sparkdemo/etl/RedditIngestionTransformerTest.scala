package me.rakirahman.sparkdemo.etl

import me.rakirahman.reddit._
import me.rakirahman.sparkdemo.etl.loader.bronze.reddit._

import org.apache.spark.sql.{DataFrame, SparkSession}

import org.scalatest.CancelAfterFailure
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.must.Matchers

class RedditIngestionTransformerTest extends AnyFunSpec with Matchers with CancelAfterFailure {

  lazy val spark: SparkSession = SparkSession.builder
    .master("local")
    .appName(this.getClass.getSimpleName.stripSuffix("$"))
    .config("spark.sql.shuffle.partitions", "1")
    .getOrCreate()

  private val FetchRunId: Long = 1700000000000L
  private val Subreddit: String = "MicrosoftFabric"
  private val FetchedAtMs: Long = 1700000123000L

  /** Build a flat raw-rows DataFrame from a list of (kind, postId, parentId, depth, payloadJson) tuples. */
  private def buildRawDF(rows: Seq[(String, String, String, Option[Int], String)]): DataFrame = {
    val seq = rows.map { case (kind, postId, parentId, depth, payloadJson) =>
      RedditRawRow(
        fetchRunId = FetchRunId,
        subreddit = Subreddit,
        kind = kind,
        parentId = parentId,
        postId = postId,
        depth = depth.map(d => Integer.valueOf(d)).orNull,
        fetchedAtEpochMs = FetchedAtMs,
        payloadJson = payloadJson
      )
    }
    import spark.implicits._
    seq
      .toDF()
      .withColumnRenamed("fetchRunId", RedditIngestionConstants.ColFetchRunId)
      .withColumnRenamed("subreddit", RedditIngestionConstants.ColSubreddit)
      .withColumnRenamed("kind", RedditIngestionConstants.ColKind)
      .withColumnRenamed("parentId", RedditIngestionConstants.ColParentId)
      .withColumnRenamed("postId", RedditIngestionConstants.ColPostId)
      .withColumnRenamed("depth", RedditIngestionConstants.ColDepth)
      .withColumnRenamed("fetchedAtEpochMs", "fetched_at_epoch_ms")
      .withColumnRenamed("payloadJson", RedditIngestionConstants.ColPayloadJson)
  }

  describe("RedditIngestionTransformer") {

    val transformer = new RedditIngestionTransformer

    val postPayload = """{
      "id":"abc123","name":"t3_abc123","title":"Test post","selftext":"hello world",
      "url":"https://x.com/p/abc123","permalink":"/r/MicrosoftFabric/comments/abc123/test_post/",
      "score":42,"upvote_ratio":0.95,"num_comments":7,"is_self":true,"over_18":false,
      "stickied":false,"locked":false,"link_flair_text":"Question",
      "created_utc":1700000000.0,"subreddit_id":"t5_2qh1i","subreddit":"MicrosoftFabric",
      "subreddit_subscribers":50000,"author":"alice","author_fullname":"t2_alice1"
    }"""

    val deletedPostPayload = """{
      "id":"def456","name":"t3_def456","title":"Deleted","selftext":null,
      "url":null,"permalink":"/r/MicrosoftFabric/comments/def456/deleted/",
      "score":0,"upvote_ratio":0.5,"num_comments":0,"is_self":true,"over_18":false,
      "stickied":false,"locked":true,"link_flair_text":null,
      "created_utc":1700000001.0,"subreddit_id":"t5_2qh1i","subreddit":"MicrosoftFabric",
      "subreddit_subscribers":50000,"author":"[deleted]","author_fullname":null
    }"""

    val commentTopPayload = """{
      "id":"c001","name":"t1_c001","body":"top-level comment","score":5,
      "depth":0,"is_submitter":false,"stickied":false,"created_utc":1700000050.0,
      "edited":false,"author":"bob","author_fullname":"t2_bob1"
    }"""

    val commentEditedPayload = """{
      "id":"c002","name":"t1_c002","body":"edited reply","score":3,
      "depth":1,"is_submitter":true,"stickied":false,"created_utc":1700000060.0,
      "edited":1700000070.0,"author":"alice","author_fullname":"t2_alice1"
    }"""

    val commentDeletedPayload = """{
      "id":"c003","name":"t1_c003","body":"[deleted]","score":1,
      "depth":2,"is_submitter":false,"stickied":false,"created_utc":1700000080.0,
      "edited":false,"author":"[deleted]","author_fullname":null
    }"""

    val subredditPayload = """{
      "id":"t5_2qh1i","display_name":"MicrosoftFabric","subscribers":50000,"created_utc":null
    }"""

    val rawDF = buildRawDF(
      Seq(
        ("t5", null, null, None, subredditPayload),
        ("t3", null, null, None, postPayload),
        ("t3", null, null, None, deletedPostPayload),
        ("t1", "t3_abc123", "t3_abc123", Some(0), commentTopPayload),
        ("t1", "t3_abc123", "t1_c001", Some(1), commentEditedPayload),
        ("t1", "t3_abc123", "t1_c002", Some(2), commentDeletedPayload)
      )
    )

    val parsedDF = transformer.transform(rawDF)
    parsedDF.cache()

    it("should attach bronze_ingest_time, fetched_at, and event_year_date to the raw DataFrame") {
      parsedDF.columns must contain(RedditIngestionConstants.ColBronzeIngestTime)
      parsedDF.columns must contain(RedditIngestionConstants.ColFetchedAt)
      parsedDF.columns must contain(RedditIngestionConstants.ColEventYearDate)
      val partition = parsedDF.select(RedditIngestionConstants.ColEventYearDate).distinct().collect()
      partition.length mustBe 1
      partition.head.getString(0).length mustBe 8
    }

    it("should extract posts with typed columns matching the input payload") {
      val posts = transformer.extractPosts(parsedDF)
      posts.count() mustBe 2L
      val expectedColumns = Set(
        "id",
        "short_id",
        "subreddit_id",
        "author_id",
        "title",
        "selftext",
        "url",
        "permalink",
        "score",
        "upvote_ratio",
        "num_comments",
        "is_self",
        "over_18",
        "stickied",
        "locked",
        "flair_text",
        "created_utc",
        "fetched_at",
        RedditIngestionConstants.ColFetchRunId,
        RedditIngestionConstants.ColEventYearDate
      )
      posts.columns.toSet mustBe expectedColumns

      val alicePost = posts.where("id = 't3_abc123'").collect().head
      alicePost.getAs[String]("short_id") mustBe "abc123"
      alicePost.getAs[String]("subreddit_id") mustBe "t5_2qh1i"
      alicePost.getAs[String]("author_id") mustBe "t2_alice1"
      alicePost.getAs[Int]("score") mustBe 42
      alicePost.getAs[Double]("upvote_ratio") mustBe 0.95
      alicePost.getAs[String]("flair_text") mustBe "Question"
      alicePost.getAs[Boolean]("locked") mustBe false
    }

    it("should collapse [deleted] post authors to the 'deleted' sentinel id") {
      val posts = transformer.extractPosts(parsedDF)
      val deletedPost = posts.where("id = 't3_def456'").collect().head
      deletedPost.getAs[String]("author_id") mustBe RedditKinds.DeletedAuthorId
      deletedPost.getAs[String]("title") mustBe "Deleted"
    }

    it("should extract comments preserving depth, parent_id, and post_id from the raw row") {
      val comments = transformer.extractComments(parsedDF)
      comments.count() mustBe 3L
      val expectedColumns = Set(
        "id",
        "post_id",
        RedditIngestionConstants.ColParentId,
        "author_id",
        "body",
        "score",
        "depth",
        "is_submitter",
        "stickied",
        "created_utc",
        "edited_utc",
        "fetched_at",
        RedditIngestionConstants.ColFetchRunId,
        RedditIngestionConstants.ColEventYearDate
      )
      comments.columns.toSet mustBe expectedColumns

      val top = comments.where("id = 't1_c001'").collect().head
      top.getAs[String]("post_id") mustBe "t3_abc123"
      top.getAs[String](RedditIngestionConstants.ColParentId) mustBe "t3_abc123"
      top.getAs[Int]("depth") mustBe 0
      top.getAs[String]("author_id") mustBe "t2_bob1"
    }

    it("should emit edited_utc only when 'edited' is numeric, null otherwise") {
      val comments = transformer.extractComments(parsedDF)
      val edited = comments.where("id = 't1_c002'").collect().head
      edited.getAs[java.sql.Timestamp]("edited_utc") must not be null
      val notEdited = comments.where("id = 't1_c001'").collect().head
      notEdited.isNullAt(notEdited.fieldIndex("edited_utc")) mustBe true
    }

    it("should collapse [deleted] comment authors to the 'deleted' sentinel id") {
      val comments = transformer.extractComments(parsedDF)
      val deleted = comments.where("id = 't1_c003'").collect().head
      deleted.getAs[String]("author_id") mustBe RedditKinds.DeletedAuthorId
    }

    it("should derive authors from t1 and t3 rows and collapse [deleted] users to one row") {
      val authors = transformer.extractAuthors(parsedDF)
      val ids = authors.select("id").distinct().collect().map(_.getString(0)).toSet
      ids must contain(RedditKinds.DeletedAuthorId)
      ids must contain("t2_alice1")
      ids must contain("t2_bob1")
      val deletedRow = authors.where(s"id = '${RedditKinds.DeletedAuthorId}'").collect().head
      deletedRow.getAs[Boolean]("is_deleted") mustBe true
      deletedRow.getAs[String]("name") mustBe RedditKinds.DeletedAuthorName
    }

    it("should extract subreddits with the typed schema") {
      val subreddits = transformer.extractSubreddits(parsedDF)
      subreddits.count() mustBe 1L
      val row = subreddits.collect().head
      row.getAs[String]("id") mustBe "t5_2qh1i"
      row.getAs[String]("display_name") mustBe "MicrosoftFabric"
      row.getAs[Int]("subscribers") mustBe 50000
    }

    it("should materialize the fetch_runs DataFrame from bookkeeping") {
      val bookkeeping = RedditIngestionBookkeeping(
        runId = FetchRunId,
        subreddit = Subreddit,
        listingType = "top",
        timeWindow = "month",
        limitRequested = 5,
        skipComments = false,
        startedAtEpochMs = FetchedAtMs,
        finishedAtEpochMs = FetchedAtMs + 60000L,
        postsIngested = 2L,
        commentsIngested = 3L,
        moreCalls = 1L,
        subredditsSeen = 1,
        authorsSeen = 3
      )
      val runs = transformer.extractFetchRuns(spark, bookkeeping)
      runs.count() mustBe 1L
      val row = runs.collect().head
      row.getAs[Long]("run_id") mustBe FetchRunId
      row.getAs[String](RedditIngestionConstants.ColSubreddit) mustBe Subreddit
      row.getAs[String]("listing_type") mustBe "top"
      row.getAs[String]("time_window") mustBe "month"
      row.getAs[Int]("limit_requested") mustBe 5
      row.getAs[Int]("posts_ingested") mustBe 2
      row.getAs[Int]("comments_ingested") mustBe 3
      row.getAs[Long]("more_calls") mustBe 1L
    }

    it("should handle an empty raw DataFrame without error") {
      val emptyDF = buildRawDF(Seq.empty)
      val parsed = transformer.transform(emptyDF)
      transformer.extractPosts(parsed).count() mustBe 0L
      transformer.extractComments(parsed).count() mustBe 0L
      transformer.extractAuthors(parsed).count() mustBe 0L
      transformer.extractSubreddits(parsed).count() mustBe 0L
    }
  }

  describe("RedditIngestionReader") {

    it("should walk a synthetic listing through a stub client and produce the right counts") {
      val client = new StubRedditClient(
        listing = Seq(
          Map(
            "id" -> "p1",
            "name" -> "t3_p1",
            "title" -> "First",
            "permalink" -> "/r/x/comments/p1/first/",
            "subreddit_id" -> "t5_x",
            "subreddit" -> "x",
            "author" -> "alice",
            "author_fullname" -> "t2_alice"
          ),
          Map(
            "id" -> "p2",
            "name" -> "t3_p2",
            "title" -> "Second",
            "permalink" -> "/r/x/comments/p2/second/",
            "subreddit_id" -> "t5_x",
            "subreddit" -> "x",
            "author" -> "[deleted]",
            "author_fullname" -> null
          )
        ),
        commentsByPost = Map(
          "p1" -> Seq(
            Map(
              "kind" -> "t1",
              "data" -> Map(
                "id" -> "c1",
                "name" -> "t1_c1",
                "body" -> "hi",
                "depth" -> 0,
                "author" -> "bob",
                "author_fullname" -> "t2_bob",
                "replies" -> Map(
                  "kind" -> "Listing",
                  "data" -> Map(
                    "children" -> Seq(
                      Map(
                        "kind" -> "t1",
                        "data" -> Map(
                          "id" -> "c2",
                          "name" -> "t1_c2",
                          "body" -> "nested",
                          "depth" -> 1,
                          "author" -> "alice",
                          "author_fullname" -> "t2_alice"
                        )
                      ),
                      Map(
                        "kind" -> "more",
                        "data" -> Map(
                          "children" -> Seq("c3"),
                          "parent_id" -> "t1_c1"
                        )
                      )
                    )
                  )
                )
              )
            )
          ),
          "p2" -> Seq.empty
        ),
        morechildren = Map(
          "c3" -> Seq(
            Map(
              "kind" -> "t1",
              "data" -> Map(
                "id" -> "c3",
                "name" -> "t1_c3",
                "body" -> "expanded",
                "depth" -> 1,
                "parent_id" -> "t1_c1",
                "author" -> "carol",
                "author_fullname" -> "t2_carol"
              )
            )
          )
        )
      )

      val reader = new RedditIngestionReader(
        spark = spark,
        client = client,
        subreddit = "x",
        listingType = RedditListingTypes.Top,
        timeWindow = Some(RedditTimeWindows.Month),
        limit = 10,
        skipComments = false,
        maxRecursionDepth = 50,
        fetchRunId = FetchRunId
      )

      val raw = reader.read()
      raw.cache()
      raw.where("kind = 't3'").count() mustBe 2L
      raw.where("kind = 't1'").count() mustBe 3L
      raw.where("kind = 't5'").count() mustBe 1L

      val bookkeeping = reader.bookkeeping
      bookkeeping.postsIngested mustBe 2L
      bookkeeping.commentsIngested mustBe 3L
      bookkeeping.moreCalls mustBe 1L
      bookkeeping.subredditsSeen mustBe 1
      bookkeeping.authorsSeen mustBe 4
    }

    it("should respect skipComments=true and emit zero t1 rows") {
      val client = new StubRedditClient(
        listing = Seq(
          Map(
            "id" -> "p1",
            "name" -> "t3_p1",
            "title" -> "First",
            "permalink" -> "/r/x/comments/p1/first/",
            "subreddit_id" -> "t5_x",
            "subreddit" -> "x",
            "author" -> "alice",
            "author_fullname" -> "t2_alice"
          )
        ),
        commentsByPost = Map.empty,
        morechildren = Map.empty
      )

      val reader = new RedditIngestionReader(
        spark = spark,
        client = client,
        subreddit = "x",
        listingType = RedditListingTypes.New,
        timeWindow = None,
        limit = 5,
        skipComments = true,
        maxRecursionDepth = 50,
        fetchRunId = FetchRunId
      )
      val raw = reader.read()
      raw.where("kind = 't1'").count() mustBe 0L
      raw.where("kind = 't3'").count() mustBe 1L
    }
  }
}

/** Stub [[me.rakirahman.reddit.RedditClient]] for transformer + reader tests.
  *
  * @param listing
  *   The synthetic listing the stub yields for any [[paginateListing]] call.
  * @param commentsByPost
  *   `shortId -> top-level comment things` map.
  * @param morechildren
  *   `firstChildId -> expanded things` map (keyed by the first id in the batch).
  */
class StubRedditClient(
    listing: Seq[Map[String, Any]],
    commentsByPost: Map[String, Seq[Map[String, Any]]],
    morechildren: Map[String, Seq[Map[String, Any]]]
) extends RedditClient {

  private var moreCalls: Long = 0L

  override def paginateListing(
      subreddit: String,
      listingType: RedditListingTypes.ListingType,
      timeWindow: Option[RedditTimeWindows.TimeWindow],
      limit: Int
  ): Iterator[Map[String, Any]] = listing.iterator.take(limit)

  override def fetchComments(shortId: String): (Map[String, Any], Seq[Map[String, Any]]) =
    Map.empty[String, Any] -> commentsByPost.getOrElse(shortId, Seq.empty)

  override def expandMore(linkId: String, childIds: Seq[String]): Seq[Map[String, Any]] = {
    moreCalls += 1L
    childIds.headOption.flatMap(morechildren.get).getOrElse(Seq.empty)
  }

  override def moreCallCount: Long = moreCalls
}
