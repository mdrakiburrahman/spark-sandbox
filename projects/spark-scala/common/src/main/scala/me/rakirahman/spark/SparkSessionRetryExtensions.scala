package me.rakirahman.spark

import org.apache.spark.sql.{DataFrame, SparkSession}

import scala.util.matching.Regex

/** Retry extensions for SparkSession SQL operations.
  *
  * Usage:
  * {{{
  *   import me.rakirahman.spark.SparkSessionRetryExtensions._
  *
  *   val df = spark.sqlWithRetry("SELECT * FROM my_delta_table")
  * }}}
  */
// @formatter:off
object SparkSessionRetryExtensions {

  implicit class SparkSessionOps(spark: SparkSession) {

    /** Execute SQL with automatic retry on matching error patterns.
      */
    def sqlWithRetry(
        sqlText: String,
        retryPatterns: Array[Regex] = SparkExceptions.DefaultDeltaRetryPatterns.map(_.r),
        maxAttempts: Int = RetryPolicy.DefaultMaxAttempts
    ): DataFrame = {
      RetryPolicy(retryPatterns, maxAttempts).execute { spark.sql(sqlText) }
    }

    /** Execute an operation with retry logic on matching error patterns.
      */
    def retryOnPatterns[T](
        patterns: Array[Regex],
        maxAttempts: Int,
        attempt: Int
    )(operation: => T): T = {
      RetryPolicy(patterns, maxAttempts).execute(operation)
    }
  }
}
// @formatter:on
