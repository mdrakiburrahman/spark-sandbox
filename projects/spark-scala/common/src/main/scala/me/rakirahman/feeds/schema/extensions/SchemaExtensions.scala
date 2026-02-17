package me.rakirahman.feeds.schema.extensions

import org.apache.spark.sql.{Column, DataFrame}
import org.apache.spark.sql.functions.col
import org.apache.spark.sql.types.StructType

/** Provides extension methods for working with DataFrame schemas.
  */
object SchemaExtensions {

  /** Implicit class for deduplicating an Array of (String, String) tuples.
    *
    * @param items
    *   The array of tuples to operate on.
    */
  implicit class TupleArrayDeduplicator(items: Array[(String, String)]) {

    /** Deduplicates the array by removing duplicate tuples while preserving
      * order of first occurrence.
      *
      * @return
      *   A new array with duplicates removed.
      */
    def withItemsDeduped: Array[(String, String)] = items.distinct
  }

  /** Implicit class for flattening a DataFrame schema.
    *
    * @param dataFrame
    *   The DataFrame to be flattened.
    */
  implicit class SchemaFlattener(dataFrame: DataFrame) {

    /** Converts a StructType schema into an array of Column expressions by
      * recursively flattening it.
      *
      * @param schema
      *   The StructType schema to be flattened.
      * @param prefix
      *   An optional prefix to be added to column names during flattening.
      * @return
      *   An array of Column expressions representing the flattened schema.
      */
    def flattenedSchema(
        schema: StructType,
        prefix: String = null
    ): Array[Column] = {
      schema.fields.flatMap(f => {
        val columnName = if (prefix == null) f.name else (prefix + "." + f.name)

        f.dataType match {
          case st: StructType => flattenedSchema(st, columnName)
          case _ => Array(col(columnName).as(columnName.replace(".", "_")))
        }
      })
    }
  }
}
