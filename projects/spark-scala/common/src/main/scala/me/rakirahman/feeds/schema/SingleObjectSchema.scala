package me.rakirahman.feeds.schema

import org.apache.spark.sql.types.StructType

/** Represents a trait for a single object schema.
  */
trait SingleObjectSchema {

  /** The schema for the single object.
    */
  val schema: StructType
}
