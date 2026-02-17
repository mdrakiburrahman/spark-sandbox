package me.rakirahman.feeds.schema.extensions

import me.rakirahman.feeds.schema.StarDimension2Schema

/** Provides extension methods for working with [[StarDimension2Schema]].
  */
// @formatter:off
object StarDimension2SchemaExtensions extends HashedKeyGenerator with IntegrityEnforcements {

  /** Implicit class for transforming a [[StarDimension2Schema]].
    *
    * @param schema
    *   The [[StarDimension2Schema]] to operate on.
    */
  implicit class StarDimension2SchemaExtensions(schema: StarDimension2Schema) {

    /** Generates a primary key hash for the specified natural key and dimension
      * columns.
      */
    def toPrimaryKeyHash(
        naturalKey: String,
        dimensionColumns: Array[String],
        primaryKeyHashVersionColumn: String
    ): String = toUniqueHash((Array(naturalKey, primaryKeyHashVersionColumn) ++ dimensionColumns))

    /** Generates a primary key hash for the stored natural key and dimension
      * columns.
      */
    def toPrimaryKeyHash(): String = this.toPrimaryKeyHash(schema.naturalKey._1, schema.dimensionColumns.map(_._1), schema.primaryKeyHashVersionColumn._1)

    /** Generates a match statement for the dimension columns and the primary
      * key hash version column.
      */
    def toMatchStatement(): String = {
      (Array(schema.primaryKeyHashVersionColumn._1) ++ schema.dimensionColumns
        .map(_._1))
        .map { colName =>
          s"updates.$colName <> destination.$colName"
        }
        .mkString(" OR ")
    }

    /** Retrieves the UPSERT-able columns.
      */
    def toUpsertableColumns(): Array[String] = {
      Array(
        schema.primaryKey._1,
        schema.naturalKey._1,
        schema.primaryKeyHashVersionColumn._1
      ) ++
        schema.dimensionColumns.map(_._1) ++
        schema.metadataColumns.map(_._1) ++
        schema.partitionColumns.map(_._1)
    }

    /** Generates a map containing all columns to be UPSERT-ed.
      */
    def toFullColumnUpsertMap(): Map[String, String] = {
      Map(
        schema.primaryKey._1                                                ->    s"updates.${schema.primaryKey._1}",
        schema.naturalKey._1                                                ->    s"updates.${schema.naturalKey._1}",
        schema.primaryKeyHashVersionColumn._1                               ->    s"updates.${schema.primaryKeyHashVersionColumn._1}"
      ) ++
      (
        schema.dimensionColumns.map    { case (colName, _) => colName       ->     s"updates.$colName"}.toMap ++
        schema.metadataColumns.map     { case (colName, _) => colName       ->     s"updates.$colName"}.toMap ++
        schema.partitionColumns.map    { case (colName, _) => colName       ->     s"updates.$colName"}.toMap
      ) ++
      Map(
        "is_row_effective"                                                  ->     "true",
        "row_effective_start"                                               ->     "updates.row_effective_start",
        "row_effective_end"                                                 ->     "cast(date_format('9999-12-31 12:00:00.000000000', 'yyyy-MM-dd HH:mm:ss.SSS') as timestamp)"
      )
    }
  }
}
// @formatter:on
