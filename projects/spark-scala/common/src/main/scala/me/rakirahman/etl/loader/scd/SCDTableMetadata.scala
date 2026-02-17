package me.rakirahman.etl.loader.scd

/** Describes metadata for a Slowly Changing Dimension table.
  *
  * @tparam T
  *   The covariant type of the table driver.
  * @tparam C
  *   The type of the driver config.
  * @tparam V
  *   The type of the validation check.
  * @tparam P
  *   The type of predicate config.
  * @tparam I
  *   The type of integrity config.
  */
trait SCDTableMetadata[+T, C, V, P, I] {

  /** Represents the table to schema mapping.
    */
  val destinationTableToSchemaMap: Map[_ <: T, C]

  /** The sequence of dimension tables that can be processed in parallel.
    */
  val parallelizableDimTables: Seq[T]

  /** The sequence of dimension tables that cannot be processed in parallel.
    */
  val nonParallelizableDimTables: Seq[T]

  /** A map of table names to a sequence of data quality validations.
    */
  val tableDataQualityValidations: Map[String, V => Seq[V]]

  /** The map of table predicates.
    */
  val tablePredicateMap: Map[String, P] = Map.empty

  /** The map of fact table integrity relationships.
    */
  val tableFactIntegrityMap: Map[String, I] = Map.empty
}
