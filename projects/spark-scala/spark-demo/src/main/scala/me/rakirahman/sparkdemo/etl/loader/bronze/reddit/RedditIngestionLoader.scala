package me.rakirahman.sparkdemo.etl.loader.bronze.reddit

import me.rakirahman.etl.loader.DataLoader
import me.rakirahman.etl.reader.DataReader
import me.rakirahman.etl.transformer.DataTransformer
import me.rakirahman.reddit._

import org.apache.spark.internal.Logging
import org.apache.spark.sql._
import org.apache.spark.sql.functions._
import org.apache.spark.sql.types._

import scala.collection.mutable

/** Table names, column names, and DDL specs for the Reddit bronze layer.
  */
object RedditIngestionConstants {

  val PostsTable: String = "posts"
  val CommentsTable: String = "comments"
  val AuthorsTable: String = "authors"
  val SubredditsTable: String = "subreddits"
  val FetchRunsTable: String = "fetch_runs"

  val ColFetchRunId: String = "fetch_run_id"
  val ColFetchedAt: String = "fetched_at"
  val ColEventYearDate: String = "event_year_date"
  val ColKind: String = "kind"
  val ColParentId: String = "parent_id"
  val ColPostId: String = "post_id"
  val ColDepth: String = "depth"
  val ColSubreddit: String = "subreddit"
  val ColPayloadJson: String = "payload_json"
  val ColParsed: String = "parsed_payload"
  val ColBronzeIngestTime: String = "bronze_ingest_time"

  val postsDdl: Array[(String, String)] = Array(
    "id" -> "STRING",
    "short_id" -> "STRING",
    "subreddit_id" -> "STRING",
    "author_id" -> "STRING",
    "title" -> "STRING",
    "selftext" -> "STRING",
    "url" -> "STRING",
    "permalink" -> "STRING",
    "score" -> "INT",
    "upvote_ratio" -> "DOUBLE",
    "num_comments" -> "INT",
    "is_self" -> "BOOLEAN",
    "over_18" -> "BOOLEAN",
    "stickied" -> "BOOLEAN",
    "locked" -> "BOOLEAN",
    "flair_text" -> "STRING",
    "created_utc" -> "TIMESTAMP",
    "fetched_at" -> "TIMESTAMP",
    ColFetchRunId -> "BIGINT",
    ColEventYearDate -> "STRING"
  )

  val commentsDdl: Array[(String, String)] = Array(
    "id" -> "STRING",
    "post_id" -> "STRING",
    ColParentId -> "STRING",
    "author_id" -> "STRING",
    "body" -> "STRING",
    "score" -> "INT",
    "depth" -> "INT",
    "is_submitter" -> "BOOLEAN",
    "stickied" -> "BOOLEAN",
    "created_utc" -> "TIMESTAMP",
    "edited_utc" -> "TIMESTAMP",
    "fetched_at" -> "TIMESTAMP",
    ColFetchRunId -> "BIGINT",
    ColEventYearDate -> "STRING"
  )

  val authorsDdl: Array[(String, String)] = Array(
    "id" -> "STRING",
    "name" -> "STRING",
    "is_deleted" -> "BOOLEAN",
    "fetched_at" -> "TIMESTAMP",
    ColFetchRunId -> "BIGINT",
    ColEventYearDate -> "STRING"
  )

  val subredditsDdl: Array[(String, String)] = Array(
    "id" -> "STRING",
    "display_name" -> "STRING",
    "subscribers" -> "INT",
    "created_utc" -> "TIMESTAMP",
    "fetched_at" -> "TIMESTAMP",
    ColFetchRunId -> "BIGINT",
    ColEventYearDate -> "STRING"
  )

  val fetchRunsDdl: Array[(String, String)] = Array(
    "run_id" -> "BIGINT",
    ColSubreddit -> "STRING",
    "listing_type" -> "STRING",
    "time_window" -> "STRING",
    "limit_requested" -> "INT",
    "skip_comments" -> "BOOLEAN",
    "started_at" -> "TIMESTAMP",
    "finished_at" -> "TIMESTAMP",
    "posts_ingested" -> "INT",
    "comments_ingested" -> "INT",
    "more_calls" -> "BIGINT",
    "subreddits_seen" -> "INT",
    "authors_seen" -> "INT",
    ColEventYearDate -> "STRING"
  )

  val rawSchema: StructType = StructType(
    Array(
      StructField(ColFetchRunId, LongType, nullable = false),
      StructField(ColSubreddit, StringType, nullable = false),
      StructField(ColKind, StringType, nullable = false),
      StructField(ColParentId, StringType, nullable = true),
      StructField(ColPostId, StringType, nullable = true),
      StructField(ColDepth, IntegerType, nullable = true),
      StructField("fetched_at_epoch_ms", LongType, nullable = false),
      StructField(ColPayloadJson, StringType, nullable = false)
    )
  )

  val postPayloadSchema: StructType = StructType(
    Array(
      StructField("id", StringType),
      StructField("name", StringType),
      StructField("title", StringType),
      StructField("selftext", StringType),
      StructField("url", StringType),
      StructField("permalink", StringType),
      StructField("score", IntegerType),
      StructField("upvote_ratio", DoubleType),
      StructField("num_comments", IntegerType),
      StructField("is_self", BooleanType),
      StructField("over_18", BooleanType),
      StructField("stickied", BooleanType),
      StructField("locked", BooleanType),
      StructField("link_flair_text", StringType),
      StructField("created_utc", DoubleType),
      StructField("subreddit_id", StringType),
      StructField("subreddit", StringType),
      StructField("subreddit_subscribers", IntegerType),
      StructField("author", StringType),
      StructField("author_fullname", StringType)
    )
  )

  val commentPayloadSchema: StructType = StructType(
    Array(
      StructField("id", StringType),
      StructField("name", StringType),
      StructField("body", StringType),
      StructField("score", IntegerType),
      StructField("depth", IntegerType),
      StructField("is_submitter", BooleanType),
      StructField("stickied", BooleanType),
      StructField("created_utc", DoubleType),
      StructField("edited", StringType),
      StructField("author", StringType),
      StructField("author_fullname", StringType)
    )
  )

  val subredditPayloadSchema: StructType = StructType(
    Array(
      StructField("id", StringType),
      StructField("display_name", StringType),
      StructField("subscribers", IntegerType),
      StructField("created_utc", DoubleType)
    )
  )
}

/** Counters + summary captured by the [[RedditIngestionReader]] for the `fetch_runs` table.
  *
  * @param runId
  *   Synthetic epoch-ms run identifier.
  * @param subreddit
  *   Display name (no `r/` prefix).
  * @param listingType
  *   Reddit listing type (e.g. `top`).
  * @param timeWindow
  *   Reddit time window (`month` etc.); empty when not applicable.
  * @param limitRequested
  *   The configured Limit (before any clamp).
  * @param skipComments
  *   Whether the run skipped comment fetches.
  * @param startedAtEpochMs
  *   When the walk started.
  * @param finishedAtEpochMs
  *   When the walk finished.
  * @param postsIngested
  *   Number of `t3` rows materialized.
  * @param commentsIngested
  *   Number of `t1` rows materialized.
  * @param moreCalls
  *   `morechildren.json` API calls observed.
  * @param subredditsSeen
  *   Distinct subreddit identifiers observed.
  * @param authorsSeen
  *   Distinct author identifiers observed.
  */
case class RedditIngestionBookkeeping(
    runId: Long,
    subreddit: String,
    listingType: String,
    timeWindow: String,
    limitRequested: Int,
    skipComments: Boolean,
    startedAtEpochMs: Long,
    finishedAtEpochMs: Long,
    postsIngested: Long,
    commentsIngested: Long,
    moreCalls: Long,
    subredditsSeen: Int,
    authorsSeen: Int
)

/** Typed per-table outputs returned by the driver after fan-out.
  */
case class RedditIngestionResult(
    posts: DataFrame,
    comments: DataFrame,
    authors: DataFrame,
    subreddits: DataFrame,
    fetchRuns: DataFrame
)

/** Walks Reddit via [[RedditClient]] and materializes a flat DataFrame of raw `t1` / `t3` / `t5` payloads — mirrors the Python POC's `run_ingest`.
  *
  * @param spark
  *   The Spark session.
  * @param client
  *   The HTTP client (real or test double).
  * @param subreddit
  *   Subreddit display name (no `r/` prefix).
  * @param listingType
  *   Reddit listing endpoint.
  * @param timeWindow
  *   Optional time window for `top` / `controversial`.
  * @param limit
  *   Caller-requested post count cap (clamped at [[me.rakirahman.reddit.RedditClient.ListingHardCapDefault]] by the client).
  * @param skipComments
  *   When true, skip the per-post comment-tree walk.
  * @param maxRecursionDepth
  *   Safety cap on the depth-first comment-tree walk.
  * @param fetchRunId
  *   Synthetic run identifier (epoch ms).
  */
class RedditIngestionReader(
    spark: SparkSession,
    client: RedditClient,
    subreddit: String,
    listingType: RedditListingTypes.ListingType,
    timeWindow: Option[RedditTimeWindows.TimeWindow],
    limit: Int,
    skipComments: Boolean,
    maxRecursionDepth: Int,
    fetchRunId: Long
) extends DataReader
    with Logging {

  private val rows = mutable.ArrayBuffer.empty[RedditRawRow]
  private val authorsSeen = mutable.HashSet.empty[String]
  private val subredditsSeen = mutable.HashSet.empty[String]
  private var postsIngested: Long = 0L
  private var commentsIngested: Long = 0L
  private var startedAtMs: Long = 0L
  private var finishedAtMs: Long = 0L
  private var hasRun: Boolean = false

  /** Counters + run summary populated by [[read]]. Calling before `read` returns a zero-valued snapshot.
    */
  def bookkeeping: RedditIngestionBookkeeping = RedditIngestionBookkeeping(
    runId = fetchRunId,
    subreddit = subreddit,
    listingType = listingType.toString,
    timeWindow = timeWindow.map(_.toString).getOrElse(""),
    limitRequested = limit,
    skipComments = skipComments,
    startedAtEpochMs = startedAtMs,
    finishedAtEpochMs = finishedAtMs,
    postsIngested = postsIngested,
    commentsIngested = commentsIngested,
    moreCalls = client.moreCallCount,
    subredditsSeen = subredditsSeen.size,
    authorsSeen = authorsSeen.size
  )

  /** @inheritdoc
    *
    * Walks the listing, then (unless `skipComments`) the comment tree of each post, producing a flat raw-row DataFrame against [[RedditIngestionConstants.rawSchema]].
    */
  override def read(): DataFrame = {
    if (hasRun) return toRawDataFrame()
    hasRun = true
    startedAtMs = System.currentTimeMillis()
    logInfo(s"Reddit ingest starting: subreddit=$subreddit listing=$listingType window=${timeWindow.map(_.toString).getOrElse("(n/a)")} limit=$limit skipComments=$skipComments")

    val posts = client.paginateListing(subreddit, listingType, timeWindow, limit)
    posts.foreach { rawPost =>
      ingestSubreddit(rawPost)
      trackAuthorFromThing(rawPost)
      val postFullname = RedditClient.getString(rawPost, "name")
      val postShortId = RedditClient.getString(rawPost, "id")
      rows += RedditRawRow(
        fetchRunId = fetchRunId,
        subreddit = subreddit,
        kind = RedditKinds.Link.stripSuffix("_"),
        parentId = null,
        postId = null,
        depth = null,
        fetchedAtEpochMs = System.currentTimeMillis(),
        payloadJson = RedditClient.toCompactJson(rawPost)
      )
      postsIngested += 1L

      if (!skipComments && postShortId.nonEmpty) {
        try {
          val (_, topComments) = client.fetchComments(postShortId)
          walkCommentTree(
            postFullname = postFullname,
            children = topComments,
            parentFullname = postFullname,
            depth = 0
          )
        } catch {
          case ex: RedditCookieExpiredException => throw ex
          case ex: Throwable =>
            logWarning(s"Failed to fetch comments for $postFullname: ${ex.getMessage}")
        }
      }
    }

    finishedAtMs = System.currentTimeMillis()
    logInfo(s"Reddit ingest finished: postsIngested=$postsIngested commentsIngested=$commentsIngested moreCalls=${client.moreCallCount} subredditsSeen=${subredditsSeen.size} authorsSeen=${authorsSeen.size}")
    toRawDataFrame()
  }

  private def toRawDataFrame(): DataFrame = {
    import spark.implicits._
    if (rows.isEmpty) {
      spark.createDataFrame(spark.sparkContext.emptyRDD[Row], RedditIngestionConstants.rawSchema)
    } else {
      rows.toSeq
        .toDF()
        .withColumnRenamed("fetchRunId", RedditIngestionConstants.ColFetchRunId)
        .withColumnRenamed("subreddit", RedditIngestionConstants.ColSubreddit)
        .withColumnRenamed("kind", RedditIngestionConstants.ColKind)
        .withColumnRenamed("parentId", RedditIngestionConstants.ColParentId)
        .withColumnRenamed("postId", RedditIngestionConstants.ColPostId)
        .withColumnRenamed("depth", RedditIngestionConstants.ColDepth)
        .withColumnRenamed("fetchedAtEpochMs", "fetched_at_epoch_ms")
        .withColumnRenamed("payloadJson", RedditIngestionConstants.ColPayloadJson)
        .select(RedditIngestionConstants.rawSchema.fieldNames.map(col): _*)
    }
  }

  private def ingestSubreddit(rawPost: Map[String, Any]): Unit = {
    val subId = Option(RedditClient.getString(rawPost, "subreddit_id"))
      .filter(_.nonEmpty)
      .getOrElse(s"display:${RedditClient.getString(rawPost, "subreddit")}")
    if (!subredditsSeen.contains(subId)) {
      val displayName = Option(RedditClient.getString(rawPost, "subreddit")).filter(_.nonEmpty).getOrElse(subreddit)
      val subscribers = RedditClient.getIntOpt(rawPost, "subreddit_subscribers")
      val subredditPayload: Map[String, Any] = Map(
        "id" -> subId,
        "display_name" -> displayName,
        "subscribers" -> subscribers.map(_.asInstanceOf[Any]).orNull,
        "created_utc" -> null
      )
      rows += RedditRawRow(
        fetchRunId = fetchRunId,
        subreddit = subreddit,
        kind = RedditKinds.Subreddit.stripSuffix("_"),
        parentId = null,
        postId = null,
        depth = null,
        fetchedAtEpochMs = System.currentTimeMillis(),
        payloadJson = RedditClient.toCompactJson(subredditPayload)
      )
      subredditsSeen += subId
    }
  }

  private def trackAuthorFromThing(raw: Map[String, Any]): Unit = {
    val name = Option(RedditClient.getString(raw, "author")).filter(_.nonEmpty).getOrElse(RedditKinds.DeletedAuthorName)
    val fullname = RedditClient.getString(raw, "author_fullname")
    val authorId = if (fullname.isEmpty || name == RedditKinds.DeletedAuthorName) RedditKinds.DeletedAuthorId else fullname
    authorsSeen += authorId
  }

  private def walkCommentTree(
      postFullname: String,
      children: Seq[Map[String, Any]],
      parentFullname: String,
      depth: Int
  ): Unit = {
    if (depth > maxRecursionDepth) {
      logWarning(s"post=$postFullname parent=$parentFullname hit MaxRecursionDepth=$maxRecursionDepth; skipping deeper branch")
      return
    }
    children.foreach { thing =>
      val kind = RedditClient.getString(thing, "kind")
      val data = RedditClient.getNestedMap(thing, "data")
      if (kind == "t1") {
        trackAuthorFromThing(data)
        val reportedDepth = RedditClient.getIntOpt(data, "depth").getOrElse(depth)
        rows += RedditRawRow(
          fetchRunId = fetchRunId,
          subreddit = subreddit,
          kind = RedditKinds.Comment.stripSuffix("_"),
          parentId = parentFullname,
          postId = postFullname,
          depth = Integer.valueOf(reportedDepth),
          fetchedAtEpochMs = System.currentTimeMillis(),
          payloadJson = RedditClient.toCompactJson(data)
        )
        commentsIngested += 1L
        val replies = RedditClient.getNestedMap(data, "replies")
        if (replies.nonEmpty) {
          val inner = RedditClient
            .getNestedSeq(RedditClient.getNestedMap(replies, "data"), "children")
            .collect { case m: Map[_, _] => m.asInstanceOf[Map[String, Any]] }
          val nextParent = RedditClient.getString(data, "name")
          walkCommentTree(postFullname, inner, nextParent, reportedDepth + 1)
        }
      } else if (kind == "more") {
        val childIds = RedditClient.getNestedSeq(data, "children").collect { case s: String => s }
        if (childIds.nonEmpty) {
          val expanded = client.expandMore(postFullname, childIds)
          ingestFlatThings(postFullname, parentFullname, depth, expanded)
        }
      }
    }
  }

  private def ingestFlatThings(
      postFullname: String,
      fallbackParent: String,
      fallbackDepth: Int,
      things: Seq[Map[String, Any]]
  ): Unit = {
    val pendingMore = mutable.ArrayBuffer.empty[(String, Seq[String])]
    things.foreach { thing =>
      val kind = RedditClient.getString(thing, "kind")
      val data = RedditClient.getNestedMap(thing, "data")
      if (kind == "t1") {
        trackAuthorFromThing(data)
        val reportedDepth = RedditClient.getIntOpt(data, "depth").getOrElse(fallbackDepth)
        val parent = Option(RedditClient.getString(data, "parent_id")).filter(_.nonEmpty).getOrElse(fallbackParent)
        rows += RedditRawRow(
          fetchRunId = fetchRunId,
          subreddit = subreddit,
          kind = RedditKinds.Comment.stripSuffix("_"),
          parentId = parent,
          postId = postFullname,
          depth = Integer.valueOf(reportedDepth),
          fetchedAtEpochMs = System.currentTimeMillis(),
          payloadJson = RedditClient.toCompactJson(data)
        )
        commentsIngested += 1L
      } else if (kind == "more") {
        val childIds = RedditClient.getNestedSeq(data, "children").collect { case s: String => s }
        val parent = Option(RedditClient.getString(data, "parent_id"))
          .filter(_.nonEmpty)
          .getOrElse(
            if (fallbackParent != null && fallbackParent.nonEmpty) fallbackParent else postFullname
          )
        if (childIds.nonEmpty) pendingMore += parent -> childIds
      }
    }
    pendingMore.foreach { case (parent, childIds) =>
      val deeper = client.expandMore(postFullname, childIds)
      if (deeper.nonEmpty) ingestFlatThings(postFullname, parent, fallbackDepth + 1, deeper)
    }
  }
}

/** Transforms the flat raw-row DataFrame from [[RedditIngestionReader]] into the typed per-table DataFrames consumed by the driver's `writeAll` fan-out.
  */
class RedditIngestionTransformer extends DataTransformer with Logging {

  /** @inheritdoc
    *
    * Adds a bronze ingest timestamp + an `event_year_date` partition column, and parses `payload_json` per kind so downstream extract* methods can project typed columns.
    */
  override def transform(inDF: DataFrame): DataFrame = inDF
    .withColumn(RedditIngestionConstants.ColBronzeIngestTime, current_timestamp())
    .withColumn(RedditIngestionConstants.ColFetchedAt, (col("fetched_at_epoch_ms") / lit(1000.0)).cast(TimestampType))
    .withColumn(RedditIngestionConstants.ColEventYearDate, date_format(col(RedditIngestionConstants.ColFetchedAt), "yyyyMMdd"))

  /** Project `t3` rows into the typed `posts` schema.
    */
  def extractPosts(parsedDF: DataFrame): DataFrame = {
    val t3Kind = RedditKinds.Link.stripSuffix("_")
    parsedDF
      .filter(col(RedditIngestionConstants.ColKind) === lit(t3Kind))
      .withColumn(RedditIngestionConstants.ColParsed, from_json(col(RedditIngestionConstants.ColPayloadJson), RedditIngestionConstants.postPayloadSchema))
      .select(
        col(s"${RedditIngestionConstants.ColParsed}.name").as("id"),
        col(s"${RedditIngestionConstants.ColParsed}.id").as("short_id"),
        coalesce(col(s"${RedditIngestionConstants.ColParsed}.subreddit_id"), concat(lit("display:"), col(s"${RedditIngestionConstants.ColParsed}.subreddit"))).as("subreddit_id"),
        when(
          col(s"${RedditIngestionConstants.ColParsed}.author_fullname").isNull
            || col(s"${RedditIngestionConstants.ColParsed}.author").isNull
            || col(s"${RedditIngestionConstants.ColParsed}.author") === lit(RedditKinds.DeletedAuthorName),
          lit(RedditKinds.DeletedAuthorId)
        ).otherwise(col(s"${RedditIngestionConstants.ColParsed}.author_fullname")).as("author_id"),
        coalesce(col(s"${RedditIngestionConstants.ColParsed}.title"), lit("")).as("title"),
        col(s"${RedditIngestionConstants.ColParsed}.selftext").as("selftext"),
        col(s"${RedditIngestionConstants.ColParsed}.url").as("url"),
        coalesce(col(s"${RedditIngestionConstants.ColParsed}.permalink"), lit("")).as("permalink"),
        col(s"${RedditIngestionConstants.ColParsed}.score").as("score"),
        col(s"${RedditIngestionConstants.ColParsed}.upvote_ratio").as("upvote_ratio"),
        col(s"${RedditIngestionConstants.ColParsed}.num_comments").as("num_comments"),
        col(s"${RedditIngestionConstants.ColParsed}.is_self").as("is_self"),
        col(s"${RedditIngestionConstants.ColParsed}.over_18").as("over_18"),
        col(s"${RedditIngestionConstants.ColParsed}.stickied").as("stickied"),
        col(s"${RedditIngestionConstants.ColParsed}.locked").as("locked"),
        col(s"${RedditIngestionConstants.ColParsed}.link_flair_text").as("flair_text"),
        col(s"${RedditIngestionConstants.ColParsed}.created_utc").cast(TimestampType).as("created_utc"),
        col(RedditIngestionConstants.ColFetchedAt).as("fetched_at"),
        col(RedditIngestionConstants.ColFetchRunId).as(RedditIngestionConstants.ColFetchRunId),
        col(RedditIngestionConstants.ColEventYearDate).as(RedditIngestionConstants.ColEventYearDate)
      )
  }

  /** Project `t1` rows into the typed `comments` schema.
    */
  def extractComments(parsedDF: DataFrame): DataFrame = {
    val t1Kind = RedditKinds.Comment.stripSuffix("_")
    val editedNumeric = col(s"${RedditIngestionConstants.ColParsed}.edited").cast(DoubleType)
    parsedDF
      .filter(col(RedditIngestionConstants.ColKind) === lit(t1Kind))
      .withColumn(RedditIngestionConstants.ColParsed, from_json(col(RedditIngestionConstants.ColPayloadJson), RedditIngestionConstants.commentPayloadSchema))
      .select(
        col(s"${RedditIngestionConstants.ColParsed}.name").as("id"),
        col(RedditIngestionConstants.ColPostId).as("post_id"),
        col(RedditIngestionConstants.ColParentId).as(RedditIngestionConstants.ColParentId),
        when(
          col(s"${RedditIngestionConstants.ColParsed}.author_fullname").isNull
            || col(s"${RedditIngestionConstants.ColParsed}.author").isNull
            || col(s"${RedditIngestionConstants.ColParsed}.author") === lit(RedditKinds.DeletedAuthorName),
          lit(RedditKinds.DeletedAuthorId)
        ).otherwise(col(s"${RedditIngestionConstants.ColParsed}.author_fullname")).as("author_id"),
        col(s"${RedditIngestionConstants.ColParsed}.body").as("body"),
        col(s"${RedditIngestionConstants.ColParsed}.score").as("score"),
        coalesce(col(s"${RedditIngestionConstants.ColParsed}.depth"), col(RedditIngestionConstants.ColDepth)).as("depth"),
        col(s"${RedditIngestionConstants.ColParsed}.is_submitter").as("is_submitter"),
        col(s"${RedditIngestionConstants.ColParsed}.stickied").as("stickied"),
        col(s"${RedditIngestionConstants.ColParsed}.created_utc").cast(TimestampType).as("created_utc"),
        when(editedNumeric > lit(0.0), editedNumeric.cast(TimestampType)).otherwise(lit(null).cast(TimestampType)).as("edited_utc"),
        col(RedditIngestionConstants.ColFetchedAt).as("fetched_at"),
        col(RedditIngestionConstants.ColFetchRunId).as(RedditIngestionConstants.ColFetchRunId),
        col(RedditIngestionConstants.ColEventYearDate).as(RedditIngestionConstants.ColEventYearDate)
      )
  }

  /** Derive the authors table from both `t1` and `t3` rows. The `[deleted]` sentinel collapses to a single id.
    */
  def extractAuthors(parsedDF: DataFrame): DataFrame = {
    val t1Kind = RedditKinds.Comment.stripSuffix("_")
    val t3Kind = RedditKinds.Link.stripSuffix("_")
    val commentAuthors = parsedDF
      .filter(col(RedditIngestionConstants.ColKind) === lit(t1Kind))
      .withColumn(RedditIngestionConstants.ColParsed, from_json(col(RedditIngestionConstants.ColPayloadJson), RedditIngestionConstants.commentPayloadSchema))
      .select(
        col(s"${RedditIngestionConstants.ColParsed}.author_fullname").as("fullname"),
        col(s"${RedditIngestionConstants.ColParsed}.author").as("name"),
        col(RedditIngestionConstants.ColFetchedAt).as("fetched_at"),
        col(RedditIngestionConstants.ColFetchRunId).as(RedditIngestionConstants.ColFetchRunId),
        col(RedditIngestionConstants.ColEventYearDate).as(RedditIngestionConstants.ColEventYearDate)
      )
    val postAuthors = parsedDF
      .filter(col(RedditIngestionConstants.ColKind) === lit(t3Kind))
      .withColumn(RedditIngestionConstants.ColParsed, from_json(col(RedditIngestionConstants.ColPayloadJson), RedditIngestionConstants.postPayloadSchema))
      .select(
        col(s"${RedditIngestionConstants.ColParsed}.author_fullname").as("fullname"),
        col(s"${RedditIngestionConstants.ColParsed}.author").as("name"),
        col(RedditIngestionConstants.ColFetchedAt).as("fetched_at"),
        col(RedditIngestionConstants.ColFetchRunId).as(RedditIngestionConstants.ColFetchRunId),
        col(RedditIngestionConstants.ColEventYearDate).as(RedditIngestionConstants.ColEventYearDate)
      )
    commentAuthors
      .unionByName(postAuthors)
      .select(
        when(
          col("fullname").isNull
            || col("name").isNull
            || col("name") === lit(RedditKinds.DeletedAuthorName),
          lit(RedditKinds.DeletedAuthorId)
        ).otherwise(col("fullname")).as("id"),
        coalesce(col("name"), lit(RedditKinds.DeletedAuthorName)).as("name"),
        (col("fullname").isNull || col("name") === lit(RedditKinds.DeletedAuthorName)).as("is_deleted"),
        col("fetched_at"),
        col(RedditIngestionConstants.ColFetchRunId),
        col(RedditIngestionConstants.ColEventYearDate)
      )
      .dropDuplicates(Array("id", "fetched_at"))
  }

  /** Project `t5` rows into the typed `subreddits` schema.
    */
  def extractSubreddits(parsedDF: DataFrame): DataFrame = {
    val t5Kind = RedditKinds.Subreddit.stripSuffix("_")
    parsedDF
      .filter(col(RedditIngestionConstants.ColKind) === lit(t5Kind))
      .withColumn(RedditIngestionConstants.ColParsed, from_json(col(RedditIngestionConstants.ColPayloadJson), RedditIngestionConstants.subredditPayloadSchema))
      .select(
        col(s"${RedditIngestionConstants.ColParsed}.id").as("id"),
        col(s"${RedditIngestionConstants.ColParsed}.display_name").as("display_name"),
        col(s"${RedditIngestionConstants.ColParsed}.subscribers").as("subscribers"),
        col(s"${RedditIngestionConstants.ColParsed}.created_utc").cast(TimestampType).as("created_utc"),
        col(RedditIngestionConstants.ColFetchedAt).as("fetched_at"),
        col(RedditIngestionConstants.ColFetchRunId).as(RedditIngestionConstants.ColFetchRunId),
        col(RedditIngestionConstants.ColEventYearDate).as(RedditIngestionConstants.ColEventYearDate)
      )
  }

  /** Build the single-row `fetch_runs` DataFrame from the reader's counters.
    *
    * @param spark
    *   Spark session used to materialize the DataFrame.
    * @param bookkeeping
    *   Snapshot captured at the end of [[RedditIngestionReader.read]].
    */
  def extractFetchRuns(spark: SparkSession, bookkeeping: RedditIngestionBookkeeping): DataFrame = {
    import spark.implicits._
    val partition = if (bookkeeping.finishedAtEpochMs > 0L) {
      val sdf = new java.text.SimpleDateFormat("yyyyMMdd")
      sdf.setTimeZone(java.util.TimeZone.getTimeZone("UTC"))
      sdf.format(new java.util.Date(bookkeeping.finishedAtEpochMs))
    } else ""
    Seq(
      (
        bookkeeping.runId,
        bookkeeping.subreddit,
        bookkeeping.listingType,
        bookkeeping.timeWindow,
        bookkeeping.limitRequested,
        bookkeeping.skipComments,
        new java.sql.Timestamp(bookkeeping.startedAtEpochMs),
        new java.sql.Timestamp(bookkeeping.finishedAtEpochMs),
        bookkeeping.postsIngested.toInt,
        bookkeeping.commentsIngested.toInt,
        bookkeeping.moreCalls,
        bookkeeping.subredditsSeen,
        bookkeeping.authorsSeen,
        partition
      )
    ).toDF(
      "run_id",
      RedditIngestionConstants.ColSubreddit,
      "listing_type",
      "time_window",
      "limit_requested",
      "skip_comments",
      "started_at",
      "finished_at",
      "posts_ingested",
      "comments_ingested",
      "more_calls",
      "subreddits_seen",
      "authors_seen",
      RedditIngestionConstants.ColEventYearDate
    )
  }
}

/** Composes the [[RedditIngestionReader]] and [[RedditIngestionTransformer]].
  *
  * @param reader
  *   The Reddit ingestion reader.
  * @param transformer
  *   The Reddit ingestion transformer.
  */
class RedditIngestionLoader(
    val reader: RedditIngestionReader,
    val transformer: RedditIngestionTransformer
) extends DataLoader {

  /** @inheritdoc
    *
    * Returns the raw rows DataFrame with parsing helper columns attached. The driver fans this out into typed per-table DataFrames via [[RedditIngestionTransformer.extractPosts]] / `extractComments` / etc.
    */
  override def load(): DataFrame = transformer.transform(reader.read())
}

/** Companion factory.
  */
object RedditIngestionLoader {

  /** Constructor.
    *
    * @param spark
    *   The Spark session.
    * @param client
    *   The Reddit HTTP client.
    * @param subreddit
    *   Subreddit display name (no `r/` prefix).
    * @param listingType
    *   Reddit listing endpoint.
    * @param timeWindow
    *   Optional time window for `top` / `controversial`.
    * @param limit
    *   Caller-requested post count cap.
    * @param skipComments
    *   When true, skip the per-post comment-tree walk.
    * @param maxRecursionDepth
    *   Safety cap on the depth-first walk.
    * @param fetchRunId
    *   Synthetic run identifier (epoch ms).
    * @return
    *   The [[RedditIngestionLoader]].
    */
  def apply(
      spark: SparkSession,
      client: RedditClient,
      subreddit: String,
      listingType: RedditListingTypes.ListingType,
      timeWindow: Option[RedditTimeWindows.TimeWindow],
      limit: Int,
      skipComments: Boolean,
      maxRecursionDepth: Int,
      fetchRunId: Long
  ): RedditIngestionLoader = new RedditIngestionLoader(
    new RedditIngestionReader(spark, client, subreddit, listingType, timeWindow, limit, skipComments, maxRecursionDepth, fetchRunId),
    new RedditIngestionTransformer
  )
}
