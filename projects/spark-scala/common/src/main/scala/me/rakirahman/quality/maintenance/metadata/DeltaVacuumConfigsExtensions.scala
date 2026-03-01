package me.rakirahman.quality.maintenance.metadata

object DeltaVacuumConfigsExtensions {

  implicit class DeltaVacuumConfigsValidator(metadata: DeltaVacuumMetadata) {

    /** Checks if the metadata configurations are valid.
      *
      * @return
      *   [[true]] if the configurations are valid, [[false]] otherwise.
      */
    // @formatter:off
    def isValid(): Boolean = metadata.desiredDeltaTableConfigs.forall {
      config =>
        if (!config.skipPurge) {
          config.purgePartitionColumn.nonEmpty &&
          config.purgePartitionColumnDateType != null
        } else {
          true
        } && (config.numPartitionsToRetain > 0)
    }
    // @formatter:on
  }
}
