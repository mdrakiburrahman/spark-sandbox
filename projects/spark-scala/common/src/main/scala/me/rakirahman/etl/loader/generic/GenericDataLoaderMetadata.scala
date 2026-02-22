package me.rakirahman.etl.loader.generic

/** Describes metadata for a generic data loader.
  *
  * @tparam I
  *   The type of the input from driver.
  * @tparam O
  *   The type of the metadata output the loader wants to expose to driver.
  */
trait GenericDataLoaderMetadata[I, O] {

  /** Represents the table to schema mapping.
    */
  val inputToOutputMap: Map[I, O]
}
