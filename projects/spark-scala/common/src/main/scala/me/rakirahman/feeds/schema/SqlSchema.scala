package me.rakirahman.feeds.schema

/** Represents a trait for a schema specified via SQL Syntax.
  */
trait SqlSchema {

  /** The schema for the SQL object.
    */
  val schema: Array[(String, String)]
}
