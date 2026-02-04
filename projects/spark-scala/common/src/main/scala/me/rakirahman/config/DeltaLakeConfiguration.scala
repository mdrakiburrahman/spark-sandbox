package me.rakirahman.config

/** Configuration values used for Delta lake, contains both internal and external configuration values.
  */
// @formatter:off
object DeltaLakeConfiguration {

  /** The delta log.
    */
  val DELTA_LOG = "_delta_log"

  /** The first commit file.
    */
  val FIRST_COMMIT = "00000000000000000000.json"

  /** Instructs Spark to skip over any non-ADDFILE commits during Streaming
    * Reads.
    *
    * >>> https://github.com/delta-io/delta/blob/7e85686e79ed519beb494b55de0a9bb982d32a8e/spark/src/main/scala/org/apache/spark/sql/delta/DeltaOptions.scala#L172
    *
    */
  val DELTA_CONF_SKIP_CHANGE_COMMITS = "skipChangeCommits"

  /** Instructs Spark to enable Delta Deletion Vectors on the table
    */
  val DELTA_CONF_ENABLE_DELETION_VECTORS = "delta.enableDeletionVectors"

  /** Instructs Spark to enable Delta Auto Optimize.
    *
    * >>> https://milescole.dev/data-engineering/2024/12/20/Understanding-Session-and-Table-Configs.html
    *
    */
  val DELTA_CONF_OPTIMIZE_WRITE = "delta.autoOptimize.optimizeWrite"
  val DELTA_CONF_AUTO_COMPACT = "delta.autoOptimize.autoCompact"

  /** The target file size for Delta Lake tables.
    */
  val DELTA_TARGET_FILE_SIZE = "delta.targetFileSize"

  /** If append-only, existing records cannot be deleted, and existing values
    * cannot be updated.
    */
  val DELTA_APPEND_ONLY = "delta.appendOnly"

  /** Instructs Spark to enable Change Data Feed (Capture).
    */
  val DELTA_CONF_CDC = "delta.enableChangeDataFeed"
}
// @formatter:on
