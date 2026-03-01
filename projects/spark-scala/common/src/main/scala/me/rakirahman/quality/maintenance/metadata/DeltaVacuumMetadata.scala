package me.rakirahman.quality.maintenance.metadata

/** Trait representing the metadata for Delta Vacuum operation.
  */
trait DeltaVacuumMetadata {

  /** Represents desired config of all tables - tables not contained in this list are skipped from maintenance.
    */
  val desiredDeltaTableConfigs: Array[DesiredDeltaTableConfig]
}
