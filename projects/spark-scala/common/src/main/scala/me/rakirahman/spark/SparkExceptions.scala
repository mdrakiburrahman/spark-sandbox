package me.rakirahman.spark

/** Constants for common Spark and Delta Lake exception patterns.
  *
  * These patterns are used for matching exceptions that should trigger retries.
  */
object SparkExceptions {

  val EXCEPTION_DELTA_METADATA_CHANGED: String = "DELTA_METADATA_CHANGED"
  val EXCEPTION_DELTA_PROTOCOL_CHANGED: String = "DELTA_PROTOCOL_CHANGED"
  val EXCEPTION_HIVE_TABLE_ALREADY_EXISTS: String = "AlreadyExistsException"
  val EXCEPTION_DELTA_NON_EMPTY_LOCATION: String =
    "DELTA_CREATE_TABLE_WITH_NON_EMPTY_LOCATION"

  /** Default retry patterns for Delta Lake conflicts.
    */
  val DefaultDeltaRetryPatterns: Array[String] = Array(
    EXCEPTION_DELTA_METADATA_CHANGED,
    EXCEPTION_DELTA_PROTOCOL_CHANGED,
    EXCEPTION_HIVE_TABLE_ALREADY_EXISTS,
    EXCEPTION_DELTA_NON_EMPTY_LOCATION
  )
}
