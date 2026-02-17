package me.rakirahman.etl.loader.scd

/** Represents a configuration for a fact table integrity config.
  *
  * @param dimensionTables
  *   The array of dimension tables this fact table must have references to for
  *   referential integrity.
  */
case class SCDFactIntegrityConfig(
    dimensionTables: Array[String]
)
