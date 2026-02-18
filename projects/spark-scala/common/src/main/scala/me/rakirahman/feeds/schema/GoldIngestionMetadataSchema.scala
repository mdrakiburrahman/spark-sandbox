package me.rakirahman.feeds.schema

/** Represents a trait for gold ingestion metadata.
  */
trait GoldIngestionMetadataSchema {

  /** The metadata columns.
    */
  val metadataColumns: Array[(String, String)] = Array(
    ("gold_ingest_time", "TIMESTAMP")
  )
}
