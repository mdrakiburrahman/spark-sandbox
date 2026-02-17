package me.rakirahman.feeds.io.table

/** Enumeration defining the types of IO formats supported.
  */
object TableIOFileTypes extends Enumeration {
  type TableIOFileTypes = Value
  val Csv, Parquet, Json, Delta, Avro, Orc, SequenceFile, Xml, Text = Value
}
