package me.rakirahman.feeds.schema

/** Represents a SCD1 Dimension Table with minimal columns.
  */
// @formatter:off
trait StarDimension1Schema extends UniqueKeyTableSchema with SqlSchema with NamedTable {

  /** The Star Schema Table Type.
    */
  val starSchemaTableType: StarSchemaTableTypes.TableTypes = StarSchemaTableTypes.Dimension

  /** The Natural Key.
    */
  val naturalKey: (String, String)

  /** The slowly changing dimension columns.
    */
  val scdColumns = Array.empty[(String, String)]

  /** The dimension columns.
    */
  val dimensionColumns: Array[(String, String)]

  /** @inheritdoc
    */
  override lazy val schema = Array(primaryKey, naturalKey) ++ dimensionColumns ++ scdColumns
}
// @formatter:on
