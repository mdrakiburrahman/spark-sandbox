package me.rakirahman.sparkdemo.etl.drivers.demos

import me.rakirahman.etl.driver.DriverOpts
import me.rakirahman.metastore.sql.SqlMetastoreOperations
import me.rakirahman.parser.yaml.YamlParser
import me.rakirahman.reddit._
import me.rakirahman.reddit.rest.RedditRestClient
import me.rakirahman.spark.SparkSessionManager
import me.rakirahman.sparkdemo.config.DemoEnvironmentConfiguration
import me.rakirahman.sparkdemo.etl.loader.bronze.reddit._

import org.apache.spark.internal.Logging
import org.apache.spark.sql.{Column, DataFrame}
import org.apache.spark.sql.functions.col

import java.util.Base64
import java.nio.charset.StandardCharsets

import scala.beans.BeanProperty

/** Driver-level settings for [[DemoRedditIngestion]], decoded from the `inlineConfig` block in `spark-jobs.yaml`.
  */
class DemoRedditIngestionSettings extends DriverOpts {
  @BeanProperty var DemoRedditIngestion: DemoRedditIngestionConfig = new DemoRedditIngestionConfig

  override def isValid: Boolean = {
    val cfg = this.DemoRedditIngestion
    cfg != null &&
    cfg.Source != null &&
    cfg.Source.Subreddit != null && cfg.Source.Subreddit.nonEmpty &&
    cfg.Source.ListingType != null && cfg.Source.ListingType.nonEmpty &&
    cfg.Source.Limit > 0 &&
    cfg.RedditApi != null &&
    cfg.Retry != null &&
    cfg.Token != null &&
    cfg.Token.FilePath != null && cfg.Token.FilePath.nonEmpty &&
    cfg.Destination != null &&
    cfg.Destination.Database != null && cfg.Destination.Database.nonEmpty
  }
}

/** Top-level config block — mirrors the inline YAML shape one-for-one.
  */
class DemoRedditIngestionConfig {
  @BeanProperty var Source: DemoRedditIngestionSourceConfig = new DemoRedditIngestionSourceConfig
  @BeanProperty var RedditApi: DemoRedditIngestionApiConfig = new DemoRedditIngestionApiConfig
  @BeanProperty var Retry: DemoRedditIngestionRetryConfig = new DemoRedditIngestionRetryConfig
  @BeanProperty var Token: DemoRedditIngestionTokenConfig = new DemoRedditIngestionTokenConfig
  @BeanProperty var Destination: DemoRedditIngestionDestinationConfig = new DemoRedditIngestionDestinationConfig
}

/** Subreddit + listing knobs.
  */
class DemoRedditIngestionSourceConfig {
  @BeanProperty var Subreddit: String = _
  @BeanProperty var ListingType: String = "top"
  @BeanProperty var TimeWindow: String = "month"
  @BeanProperty var Limit: Int = 100
  @BeanProperty var SkipComments: Boolean = false
}

/** Reddit API tunables (pagination, comment limits, polite sleep, timeouts).
  */
class DemoRedditIngestionApiConfig {
  @BeanProperty var BaseUrl: String = RedditClient.BaseUrlDefault
  @BeanProperty var ListingPageSize: Int = RedditClient.ListingPageSizeDefault
  @BeanProperty var ListingHardCap: Int = RedditClient.ListingHardCapDefault
  @BeanProperty var CommentsLimit: Int = RedditClient.CommentsLimitDefault
  @BeanProperty var CommentsDepth: Int = RedditClient.CommentsDepthDefault
  @BeanProperty var CommentsSort: String = RedditClient.CommentsSortDefault
  @BeanProperty var MoreChildrenBatch: Int = RedditClient.MoreChildrenBatchDefault
  @BeanProperty var MaxRecursionDepth: Int = RedditClient.MaxRecursionDepthDefault
  @BeanProperty var RequestTimeoutSeconds: Int = RedditClient.RequestTimeoutSecondsDefault
  @BeanProperty var BaseSleepSeconds: Double = RedditClient.BaseSleepSecondsDefault
  @BeanProperty var JitterMaxSeconds: Double = RedditClient.JitterMaxSecondsDefault
}

/** Retry tunables (matches Python tenacity wait_exponential).
  */
class DemoRedditIngestionRetryConfig {
  @BeanProperty var MaxAttempts: Int = RedditClient.RetryMaxAttemptsDefault
  @BeanProperty var WaitMinSeconds: Double = RedditClient.RetryWaitMinSecondsDefault
  @BeanProperty var WaitMaxSeconds: Double = RedditClient.RetryWaitMaxSecondsDefault
  @BeanProperty var WaitMultiplier: Double = RedditClient.RetryWaitMultiplierDefault
}

/** Token envelope discovery + graceful-exit policy.
  */
class DemoRedditIngestionTokenConfig {
  @BeanProperty var FilePath: String = _
  @BeanProperty var ExitGracefulOnTokenExpiry: Boolean = true
}

/** Destination Delta database + write semantics.
  */
class DemoRedditIngestionDestinationConfig {
  @BeanProperty var Database: String = "reddit_db"
  @BeanProperty var MergeSchema: Boolean = true
}

/** Scrapes posts + comment trees from a subreddit into the `reddit_db.{posts,comments,authors,subreddits,fetch_runs}` Delta tables.
  *
  * All knobs (listing type, time window, retry/backoff, polite sleep, pagination, depth caps, token path, graceful-exit policy) are surfaced through the `inlineConfig` block on the matching `spark-jobs.yaml` entry.
  */
object DemoRedditIngestion extends App with Logging {

  val driverName = this.getClass.getSimpleName.stripSuffix("$")
  require(args.length >= 2, s"Expected at least 2 args (configFile, base64InlineConfig); got ${args.length}")
  val configFileName = args(0)
  val encodedInlineConfig = args(args.length - 1)
  require(configFileName != null && configFileName.nonEmpty, "Config file name must not be null or empty")
  require(encodedInlineConfig != null && encodedInlineConfig.nonEmpty, "Base64 inline config must not be null or empty")

  val envConfig = DemoEnvironmentConfiguration(driverName, configFileName)

  val inlineYaml = new String(Base64.getDecoder.decode(encodedInlineConfig), StandardCharsets.UTF_8)
  val driverOpts = YamlParser.loadClass(inlineYaml, classOf[DemoRedditIngestionSettings])
  driverOpts.validate
  private val cfg = driverOpts.DemoRedditIngestion

  private val listingType: RedditListingTypes.ListingType =
    RedditListingTypes.values
      .find(_.toString.equalsIgnoreCase(cfg.Source.ListingType))
      .getOrElse(
        throw new IllegalArgumentException(
          s"Unknown Source.ListingType=${cfg.Source.ListingType}; supported: ${RedditListingTypes.values.mkString(",")}"
        )
      )

  private val timeWindow: Option[RedditTimeWindows.TimeWindow] =
    if (RedditListingTypes.acceptsTimeWindow(listingType)) {
      Option(cfg.Source.TimeWindow).filter(_.nonEmpty).map { tw =>
        RedditTimeWindows.values
          .find(_.toString.equalsIgnoreCase(tw))
          .getOrElse(
            throw new IllegalArgumentException(
              s"Unknown Source.TimeWindow=$tw; supported: ${RedditTimeWindows.values.mkString(",")}"
            )
          )
      }
    } else None

  logHeader()

  private val tokenLoader = RedditTokenLoader(envConfig)
  private val envelope: RedditTokenEnvelope = tokenLoader.load(cfg.Token.FilePath) match {
    case Right(env) =>
      logInfo(s"Reddit token loaded. Expires in ${env.secondsRemaining()}s (epoch=${env.expiresAtEpochSeconds}).")
      env
    case Left(failure) =>
      if (cfg.Token.ExitGracefulOnTokenExpiry) {
        logWarning(s"Reddit token unavailable (${failure.message}); ExitGracefulOnTokenExpiry=true — exiting cleanly without any HTTP traffic.")
        sys.exit(0)
      } else {
        logError(s"Reddit token unavailable (${failure.message}); ExitGracefulOnTokenExpiry=false — failing the driver.")
        sys.exit(1)
      }
  }

  val spark = SparkSessionManager(envConfig).session
  val sqlMetastoreOperations = SqlMetastoreOperations(spark)
  sqlMetastoreOperations.createDatabase(cfg.Destination.Database)

  writeMicrosoftEmployeesSeed()

  private val client = new RedditRestClient(
    envelope = envelope,
    baseUrl = cfg.RedditApi.BaseUrl,
    listingPageSize = cfg.RedditApi.ListingPageSize,
    listingHardCap = cfg.RedditApi.ListingHardCap,
    commentsLimit = cfg.RedditApi.CommentsLimit,
    commentsDepth = cfg.RedditApi.CommentsDepth,
    commentsSort = cfg.RedditApi.CommentsSort,
    moreChildrenBatch = cfg.RedditApi.MoreChildrenBatch,
    requestTimeoutSeconds = cfg.RedditApi.RequestTimeoutSeconds,
    baseSleepSeconds = cfg.RedditApi.BaseSleepSeconds,
    jitterMaxSeconds = cfg.RedditApi.JitterMaxSeconds,
    retryMaxAttempts = cfg.Retry.MaxAttempts,
    retryWaitMinSeconds = cfg.Retry.WaitMinSeconds,
    retryWaitMaxSeconds = cfg.Retry.WaitMaxSeconds,
    retryWaitMultiplier = cfg.Retry.WaitMultiplier
  )

  private val fetchRunId = System.currentTimeMillis()

  private val loader = RedditIngestionLoader(
    spark = spark,
    client = client,
    subreddit = cfg.Source.Subreddit,
    listingType = listingType,
    timeWindow = timeWindow,
    limit = cfg.Source.Limit,
    skipComments = cfg.Source.SkipComments,
    maxRecursionDepth = cfg.RedditApi.MaxRecursionDepth,
    fetchRunId = fetchRunId
  )

  private val parsedRaw: DataFrame = loader.load()
  parsedRaw.persist()
  val rawCount = parsedRaw.count()
  logInfo(s"Materialized $rawCount raw Reddit rows in fetchRunId=$fetchRunId")

  private val transformer = loader.transformer
  private val result = RedditIngestionResult(
    posts = transformer.extractPosts(parsedRaw),
    comments = transformer.extractComments(parsedRaw),
    authors = transformer.extractAuthors(parsedRaw),
    subreddits = transformer.extractSubreddits(parsedRaw),
    fetchRuns = transformer.extractFetchRuns(spark, loader.reader.bookkeeping)
  )

  writeAll(result)
  parsedRaw.unpersist()

  logInfo(s"DemoRedditIngestion complete: subreddit=${cfg.Source.Subreddit} listing=$listingType posts=${loader.reader.bookkeeping.postsIngested} comments=${loader.reader.bookkeeping.commentsIngested} moreCalls=${client.moreCallCount}")
  spark.stop()

  // ─────────────────────────────────────────────────────────────────────────

  private def logHeader(): Unit = {
    logInfo("─" * 80)
    logInfo("Demo Reddit Ingestion")
    logInfo(s"Subreddit       : ${cfg.Source.Subreddit}")
    logInfo(s"Listing type    : ${listingType}")
    logInfo(s"Time window     : ${timeWindow.map(_.toString).getOrElse("(n/a)")}")
    logInfo(s"Limit           : ${cfg.Source.Limit} (hard cap ${cfg.RedditApi.ListingHardCap})")
    logInfo(s"Skip comments   : ${cfg.Source.SkipComments}")
    logInfo(s"Token path      : ${cfg.Token.FilePath}")
    logInfo(s"Graceful expiry : ${cfg.Token.ExitGracefulOnTokenExpiry}")
    logInfo(s"Destination DB  : ${cfg.Destination.Database}")
    logInfo(s"Polite sleep    : base=${cfg.RedditApi.BaseSleepSeconds}s jitter=${cfg.RedditApi.JitterMaxSeconds}s timeout=${cfg.RedditApi.RequestTimeoutSeconds}s")
    logInfo(s"Retry           : attempts=${cfg.Retry.MaxAttempts} min=${cfg.Retry.WaitMinSeconds}s max=${cfg.Retry.WaitMaxSeconds}s multiplier=${cfg.Retry.WaitMultiplier}")
    logInfo("─" * 80)
  }

  private def writeMicrosoftEmployeesSeed(): Unit = {
    val fqn = s"${cfg.Destination.Database}.microsoft_employees"
    val seed = MicrosoftEmployeesSeedLoader(spark).load()
    val rowCount = seed.count()
    logInfo(s"$fqn: overwriting $rowCount rows from bundled classpath seed (${MicrosoftEmployeesSeedLoader.DefaultResourcePath})")
    seed.write
      .format("delta")
      .mode("overwrite")
      .option("overwriteSchema", "true")
      .saveAsTable(fqn)
  }

  private def writeAll(r: RedditIngestionResult): Unit = {
    writeTable(
      table = RedditIngestionConstants.PostsTable,
      df = r.posts,
      partitionCols = Array(RedditIngestionConstants.ColEventYearDate),
      sortCols = Seq(col(RedditIngestionConstants.ColFetchRunId), col("score").desc)
    )
    writeTable(
      table = RedditIngestionConstants.CommentsTable,
      df = r.comments,
      partitionCols = Array(RedditIngestionConstants.ColEventYearDate),
      sortCols = Seq(col("post_id"), col(RedditIngestionConstants.ColDepth), col("score").desc)
    )
    writeTable(
      table = RedditIngestionConstants.AuthorsTable,
      df = r.authors,
      partitionCols = Array(RedditIngestionConstants.ColEventYearDate),
      sortCols = Seq(col("id"))
    )
    writeTable(
      table = RedditIngestionConstants.SubredditsTable,
      df = r.subreddits,
      partitionCols = Array(RedditIngestionConstants.ColEventYearDate),
      sortCols = Seq(col("id"))
    )
    writeTable(
      table = RedditIngestionConstants.FetchRunsTable,
      df = r.fetchRuns,
      partitionCols = Array(RedditIngestionConstants.ColEventYearDate),
      sortCols = Seq(col("run_id"))
    )
  }

  private def writeTable(
      table: String,
      df: DataFrame,
      partitionCols: Array[String],
      sortCols: Seq[Column]
  ): Unit = {
    val fqn = s"${cfg.Destination.Database}.$table"
    val rowCount = df.count()
    logInfo(s"$fqn: appending $rowCount rows")

    val partitioned =
      if (partitionCols.nonEmpty && rowCount > 0L) df.repartition(partitionCols.map(col): _*)
      else if (rowCount > 0L) df.coalesce(1)
      else df

    val sorted = if (sortCols.nonEmpty && rowCount > 0L) partitioned.sortWithinPartitions(sortCols: _*) else partitioned

    val writer = sorted.write
      .format("delta")
      .mode("append")
      .option("mergeSchema", cfg.Destination.MergeSchema.toString)

    val finalWriter = if (partitionCols.nonEmpty) writer.partitionBy(partitionCols: _*) else writer
    finalWriter.saveAsTable(fqn)
  }
}
