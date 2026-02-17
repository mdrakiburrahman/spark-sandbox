package me.rakirahman.quality.maintenance.metadata

/** Represents detailed information about a Delta table.
  */
case class DeltaTableDescription(
    format: String,
    id: String,
    name: String,
    description: String,
    location: String,
    createdAt: java.sql.Timestamp,
    lastModified: java.sql.Timestamp,
    partitionColumns: Array[String],
    clusteringColumns: Array[String],
    numFiles: Long,
    sizeInBytes: Long,
    sizeInGigaBytes: Double,
    properties: scala.collection.mutable.Map[String, String],
    minReaderVersion: Int,
    minWriterVersion: Int
)
