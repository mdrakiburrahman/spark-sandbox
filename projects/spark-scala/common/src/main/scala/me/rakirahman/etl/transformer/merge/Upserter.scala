package me.rakirahman.etl.transformer.merge

import org.apache.spark.sql.DataFrame

/** Trait representing an UPSERT handler, which is responsible for performing
  * UPSERT (UPDATE or INSERT) operations on a destination table.
  */
trait Upserter {

  /** UPSERTs the provided DataFrame into the specified destination table using
    * the Slowly Changing Dimension Type 2 (SCD2).
    *
    * @param destinationDatabase
    *   The name of the destination database.
    * @param destinationTable
    *   The name of the destination table.
    * @param dataFrame
    *   The DataFrame containing the data to be UPSERTed.
    * @param naturalKeyColumn
    *   The name of the natural key column in the destination table.
    * @param primaryKeyColumn
    *   The name of the primary key column in the destination table.
    * @param matchStatement
    *   The SQL match statement used to identify matching records.
    * @param fullColumnsUpsertMap
    *   A map of column names in the destination table to their corresponding
    *   column names in the DataFrame.
    * @param maxRetriesDuringConcurrentUpdates
    *   The maximum number of retries to perform in case of concurrent updates.
    * @param retryAfterInMilliseconds
    *   The number of milliseconds to wait between retries.
    */
  def upsertWithScd2(
      destinationDatabase: String,
      destinationTable: String,
      dataFrame: DataFrame,
      naturalKeyColumn: String,
      primaryKeyColumn: String,
      matchStatement: String,
      fullColumnsUpsertMap: Map[String, String],
      maxRetriesDuringConcurrentUpdates: Int,
      retryAfterInMilliseconds: Int
  ): Unit
}
