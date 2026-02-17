package me.rakirahman.feeds.schema

/** Represents a table that has one or more columns that are guaranteed to be
  * unique.
  */
trait UniqueKeyTableSchema {

  /** The Primary Key.
    */
  val primaryKey: (String, String)
}
