package me.rakirahman.etl.transformer.scd.processor

import org.apache.spark.sql.DataFrame
import org.apache.spark.storage.StorageLevel

/** Trait representing an SCD DataFrame processor.
  */
trait SCDDataFrameProcessor {

  /** Processes the dimension table DataFrame.
    *
    * @param inDF
    *   The input DataFrame containing the table dimension data.
    * @param destinationDatabase
    *   The destination database name.
    * @param destinationTableName
    *   The destination table name.
    * @param sourceNaturalKeyCol
    *   The column name representing the natural key from the source DataFrame.
    * @param destinationNaturalKeyCol
    *   The column name representing the natural key from the destination table.
    * @param timestampOrderCol
    *   The column name representing the order of the table - must evaluate to a
    *   timestamp.
    * @param colScdEffectiveStartTimeName
    *   The name of the column representing the effective start time.
    * @param cacheStorageLevel
    *   The cache storage level.
    * @return
    *   The processed DataFrame.
    */
  def processTableDim(
      inDF: DataFrame,
      destinationDatabase: String,
      destinationTableName: String,
      sourceNaturalKeyCol: String,
      destinationNaturalKeyCol: String,
      timestampOrderCol: String,
      colScdEffectiveStartTimeName: String,
      cacheStorageLevel: StorageLevel
  ): DataFrame

  /** Processes the fact table DataFrame.
    *
    * @param inDF
    *   The input DataFrame containing the table fact data.
    * @param destinationDatabase
    *   The destination database name.
    * @param destinationTableName
    *   The destination table name.
    * @param incomingTableName
    *   The incoming table name.
    * @param integrityQuery
    *   The referential integrity query.
    * @param primaryKeyColumnName
    *   The primary key column name.
    * @param cacheStorageLevel
    *   The cache storage level.
    * @return
    *   The processed [[DataFrame]].
    */
  def processTableFact(
      inDF: DataFrame,
      destinationDatabase: String,
      destinationTableName: String,
      incomingTableName: String,
      integrityQuery: String,
      primaryKeyColumnName: String,
      cacheStorageLevel: StorageLevel
  ): DataFrame
}
