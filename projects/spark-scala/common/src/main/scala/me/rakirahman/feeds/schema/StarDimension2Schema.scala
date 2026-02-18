package me.rakirahman.feeds.schema

import me.rakirahman.feeds.schema.extensions.SchemaExtensions._

/** Represents a trait for a Star Schema SCD2 Dimension Table.
  */
// @formatter:off
trait StarDimension2Schema
    extends VersionedSlowlyChangingSqlSchema
    with StarDimension1Schema
    with PartitionedTableSchema
    with GoldIngestionMetadataSchema {

  /** The slowly changing dimension columns.
    */
  override val scdColumns = Array(
    ("is_row_effective", "BOOLEAN"),
    ("row_effective_start", "TIMESTAMP"),
    ("row_effective_end", "TIMESTAMP")
  )

  /** @inheritdoc
    *
    * Note that this is lazy to initialize it at the end to make the other
    * fields accessible.
    */
  override lazy val schema = (Array(primaryKey, naturalKey, primaryKeyHashVersionColumn) ++ dimensionColumns ++ scdColumns ++ metadataColumns ++ partitionColumns).withItemsDeduped
}
// @formatter:on
