package me.rakirahman.metastore

import me.rakirahman.etl.transformer.sorter.SortableColumnNames
import java.sql.Timestamp

/** Trait representing operations that can be performed for partition operations.
  */
trait PartitionOperations {

  /** Get the runtime partitions of the table.
    *
    * @param databaseName
    *   The name of the database.
    * @param tableName
    *   The name of the table.
    */
  def getPartitions(
      databaseName: String,
      tableName: String
  ): Array[String]

  /** Get the distinct values for a given partition of the table.
    *
    * @param databaseName
    *   The name of the database.
    * @param tableName
    *   The name of the table.
    * @param partition
    *   The partition to get the values for.
    */
  def getDistinctPartitionValues(
      databaseName: String,
      tableName: String,
      partition: String
  ): Array[String]

  /** Retrieves distinct partition values as [[Timestamps]].
    *
    * @param databaseName
    *   The name of the database.
    * @param tableName
    *   The name of the table.
    * @param partition
    *   The partition column name.
    * @param columnName
    *   The type of the column to convert the partition values.
    * @return
    *   An array of [[Timestamps]].
    */
  def getTimestampPartitionValues(
      databaseName: String,
      tableName: String,
      partition: String,
      columnName: SortableColumnNames.Types
  ): Array[Timestamp]

  /** Retrieves the minimum and maximum partition values as [[Timestamps]].
    *
    * @param databaseName
    *   The name of the database.
    * @param tableName
    *   The name of the table.
    * @param partition
    *   The partition column name.
    * @param columnName
    *   The type of the column to convert the partition values.
    * @return
    *   A tuple containing the minimum and maximum [[Timestamps]].
    */
  def getMinMaxTimestampPartitionValues(
      databaseName: String,
      tableName: String,
      partition: String,
      columnName: SortableColumnNames.Types
  ): (Timestamp, Timestamp)
}
