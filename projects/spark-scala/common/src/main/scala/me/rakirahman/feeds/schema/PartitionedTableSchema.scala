package me.rakirahman.feeds.schema

/** Represents a trait for a partitioned table schema.
  */
trait PartitionedTableSchema {

  /** The partition columns.
    */
  val partitionColumns: Array[(String, String)]
}
