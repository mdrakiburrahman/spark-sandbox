package me.rakirahman.feeds.schema

// @formatter:off

/** Enumeration defining the types of tables for Star Schema building.
  */
object StarSchemaTableTypes extends Enumeration {
  type TableTypes                           = Value
  val Fact                                  = Value("fact")
  val Dimension                             = Value("dimension")
  val Seed                                  = Value("seed")
}

/** Constants related to Star Schema Data Loading.
  */
object StarSchemaLoaderConstants {

  /** Columns that are hydrated in the Star Schema but not in the Staging schema.
    */
  val columnsHydratedInStarSchemaNotInStaging = Array("is_row_effective", "row_effective_end")
}
// @formatter:on
