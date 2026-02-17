package me.rakirahman.metastore

import org.apache.spark.sql.types.StructType

/** Trait defining operations for schema conversion between different storage systems.
  */
trait SchemaConversionOperations {

  /** Converts a Spark [[StructType]] schema to SQL Server column definitions.
    *
    * @param desiredSchema
    *   The Spark [[StructType]] schema to convert.
    * @return
    *   Array of tuples containing column name and SQL Server data type pairs.
    */
  def convertToSqlServerSchema(
      desiredSchema: StructType
  ): Array[(String, String)]
}
