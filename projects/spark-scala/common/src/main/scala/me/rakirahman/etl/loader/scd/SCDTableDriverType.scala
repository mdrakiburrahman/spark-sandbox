package me.rakirahman.etl.loader.scd

/** Trait defining the required parameters for SCD table types.
  *
  * @tparam T
  *   The type of the table.
  */
trait SCDTableDriverType[T] {
  val tableType: T
  val tableName: String
}
