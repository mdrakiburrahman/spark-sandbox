package me.rakirahman.etl.loader.scd

/** Represents the table predicate config to perform predicate pushdowns and selective queries.
  *
  * @param columnsToKeep
  *   The columns to keep from the original table after the predicate is applied.
  * @param predicateColumnNames
  *   The column names to predicate on.
  */
case class SCDTablePredicateConfig(
    columnsToKeep: Array[String],
    predicateColumnNames: Array[String]
)
