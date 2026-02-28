package me.rakirahman.deltalog

import org.apache.spark.sql.DataFrame

/** Trait for extracting metadata from Delta Lake transaction logs.
  * @tparam T
  *   the type of the extraction result.
  */
trait MetadataExtractor[T] {

  /** Extracts metadata across all Delta tables in the estate.
    * @return
    *   The extracted metadata.
    */
  def extract(): T

  /** Extracts metadata for a specific database and table.
    */
  def extractForTable(databaseName: String, tableName: String): T
}
