package me.rakirahman.etl.loader.scd

/** Represents the per-table driver config.
  *
  * @param partitions
  *   The array of partition columns.
  * @param schema
  *   The array of column names and their corresponding data types.
  */
case class SCDTableDriverConfig(
    partitions: Array[String],
    schema: Array[(String, String)]
)
