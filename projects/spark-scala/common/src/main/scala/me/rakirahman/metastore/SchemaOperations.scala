package me.rakirahman.metastore

import org.apache.spark.sql.types.StructType

/** Trait representing operations that can be performed for schema operations.
  */
trait SchemaOperations {

  /** Merge the schema of the table with the desired schema, if not breaking.
    *
    * @param databaseName
    *   The name of the database.
    * @param tableName
    *   The name of the table.
    * @param desiredSchema
    *   The desired schema of the table.
    * @param desiredPartitionColumns
    *   The desired partition columns of the table.
    */
  def mergeSchema(
      databaseName: String,
      tableName: String,
      desiredSchema: Array[(String, String)],
      desiredPartitionColumns: Array[String]
  ): Unit

  /** Merge the schema of the table with the desired schema, if not breaking.
    *
    * @param databaseName
    *   The name of the database.
    * @param tableName
    *   The name of the table.
    * @param desiredSchema
    *   The desired schema of the table.
    */
  def mergeSchema(
      databaseName: String,
      tableName: String,
      desiredSchema: StructType
  ): Unit
}
