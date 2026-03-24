package me.rakirahman.quality.maintenance.handler

import me.rakirahman.etl.transformer.sorter.DateSorter
import me.rakirahman.metastore.PartitionOperations
import me.rakirahman.quality.maintenance.metadata._
import org.apache.spark.internal.Logging
import scala.collection.mutable.ListBuffer

/** Generates maintenance SQL scripts (VACUUM, OPTIMIZE, PURGE) for Delta tables based on desired configurations.
  */
object DeltaMaintenanceScriptGenerator extends Logging {

  /** Generates maintenance scripts for all configured tables.
    *
    * @param currentTables
    *   The current tables in the estate (database, table pairs).
    * @param desiredConfigs
    *   The desired maintenance configurations.
    * @param partitionOps
    *   Optional partition operations for purge support. When provided, enables partition-aware DELETE generation by querying actual partition values from the metastore.
    * @return
    *   A [[ListBuffer]] of [[DeltaMaintenanceScripts]] to execute.
    */
  def generateMaintenanceScripts(
      currentTables: Array[(String, String)],
      desiredConfigs: Array[DesiredDeltaTableConfig],
      partitionOps: Option[PartitionOperations] = None
  ): ListBuffer[DeltaMaintenanceScripts] = {
    val scriptsToRun = ListBuffer.empty[DeltaMaintenanceScripts]

    desiredConfigs.foreach { desiredConfig =>
      val matchingTables = findMatchingTables(currentTables, desiredConfig)

      matchingTables.foreach { case (database, table) =>
        val script = ListBuffer.empty[String]

        if (!desiredConfig.skipPurge) {
          partitionOps.foreach { ops =>
            generatePurgeScript(database, table, desiredConfig, ops).foreach(script += _)
          }
        }

        if (!desiredConfig.skipVacuum) {
          script += s"VACUUM ${database}.${table} RETAIN 168 HOURS;"
        }

        if (!desiredConfig.skipOptimize) {
          if (desiredConfig.zOrderColumns.isEmpty) {
            script += s"OPTIMIZE ${database}.${table};"
          } else {
            val zOrderColumns = desiredConfig.zOrderColumns.mkString(", ")
            script += s"OPTIMIZE ${database}.${table} ZORDER BY ($zOrderColumns);"
          }
        }

        if (script.nonEmpty && !scriptsToRun.exists(s => s.databaseName == database && s.tableName == table)) {
          scriptsToRun += DeltaMaintenanceScripts(
            database,
            table,
            script.toArray
          )
        }
      }
    }
    scriptsToRun
  }

  /** Generates a purge DELETE statement by querying actual partition values and retaining the N most recent.
    *
    * @param database
    *   The database name.
    * @param table
    *   The table name.
    * @param config
    *   The desired table config with purge settings.
    * @param partitionOps
    *   Partition operations for querying the metastore.
    * @return
    *   An optional DELETE SQL string.
    */
  def generatePurgeScript(
      database: String,
      table: String,
      config: DesiredDeltaTableConfig,
      partitionOps: PartitionOperations
  ): Option[String] = {
    if (config.purgePartitionColumn.isEmpty || config.purgePartitionColumnDateType == null) return None

    logInfo(s"Purging table ${database}.${table} with purge partition column '${config.purgePartitionColumn}' and date type '${config.purgePartitionColumnDateType}'")
    val partitions = partitionOps
      .getDistinctPartitionValues(database, table, config.purgePartitionColumn)
      .sorted(DateSorter.get(config.purgePartitionColumnDateType))

    if (partitions.length - config.numPartitionsToRetain > 0) {
      val partitionsToKeep = partitions.takeRight(config.numPartitionsToRetain).map(p => s"'${p}'").mkString(", ")
      Some(s"DELETE FROM ${database}.${table} WHERE ${config.purgePartitionColumn} NOT IN (${partitionsToKeep})")
    } else {
      logInfo(s"Table ${database}.${table} has ${partitions.length} partitions, retaining ${config.numPartitionsToRetain} - no purge needed")
      None
    }
  }

  /** Finds tables in the estate that match a desired configuration.
    *
    * @param currentTables
    *   Array of (database, table) pairs.
    * @param config
    *   The desired configuration to match against.
    * @return
    *   Array of matching (database, table) pairs.
    */
  def findMatchingTables(
      currentTables: Array[(String, String)],
      config: DesiredDeltaTableConfig
  ): Array[(String, String)] = {
    currentTables.filter { case (database, table) =>
      database == config.database && (
        config.tableNameOrPrefix == "*" ||
          (config.isPrefix && table.startsWith(config.tableNameOrPrefix)) ||
          (!config.isPrefix && table == config.tableNameOrPrefix)
      )
    }
  }

  /** Finds tables in the estate that are NOT covered by any desired configuration.
    *
    * @param currentTables
    *   Array of (database, table) pairs.
    * @param desiredConfigs
    *   The desired maintenance configurations.
    * @return
    *   Array of (database, table) pairs not covered by any config.
    */
  def findMissingTablesInDesiredConfig(
      currentTables: Array[(String, String)],
      desiredConfigs: Array[DesiredDeltaTableConfig]
  ): Array[(String, String)] = {
    val databasesWithWildcard =
      desiredConfigs.filter(_.tableNameOrPrefix == "*").map(_.database).toSet

    currentTables.filter { case (database, table) =>
      !databasesWithWildcard.contains(database) &&
      !desiredConfigs.exists { config =>
        database == config.database && (
          (config.isPrefix && table.startsWith(config.tableNameOrPrefix)) ||
            (!config.isPrefix && table == config.tableNameOrPrefix)
        )
      }
    }
  }
}
