package me.rakirahman.etl.loader.scd

/** Represents a set of view names for SCD operations.
  *
  * @param factView
  *   The name of the fact view.
  * @param dimViewMap
  *   The dimension table to view mappings.
  */
case class SCDFactIntegrityViews(
    factView: String,
    dimViewMap: Map[String, String]
)
