package me.rakirahman.quality.maintenance.metadata

import me.rakirahman.etl.transformer.sorter.DateTypes

/** Represents the scripts to run per Delta table.
  *
  * @param databaseName
  *   The name of the database.
  * @param tableName
  *   The name of the table.
  * @param scriptToRun
  *   The maintenance scripts to run.
  */
case class DeltaMaintenanceScripts(
    databaseName: String,
    tableName: String,
    scriptToRun: Array[String]
)

/** Represents desired config of a particular Delta table.
  *
  * @param database
  *   The name of the database.
  * @param tableNameOrPrefix
  *   The name or prefix of the table.
  * @param isPrefix
  *   The name is a prefix.
  * @param zOrderColumns
  *   Array of columns to Z-ORDER By.
  * @param purgePartitionColumn
  *   The purge partition column to use for purging.
  * @param purgePartitionColumnDateType
  *   The date type format of the partition column.
  * @param numPartitionsToRetain
  *   The number of partitions to retain.
  * @param skipVacuum
  *   Skips vacuum, if set.
  * @param skipOptimize
  *   Skips optimize, if set.
  * @param skipPurge
  *   Skips purging, if set.
  */
case class DesiredDeltaTableConfig(
    database: String,
    tableNameOrPrefix: String,
    isPrefix: Boolean,
    zOrderColumns: Array[String],
    purgePartitionColumn: String,
    purgePartitionColumnDateType: DateTypes.Types,
    numPartitionsToRetain: Integer,
    skipVacuum: Boolean,
    skipOptimize: Boolean,
    skipPurge: Boolean
)
