package me.rakirahman.quality.maintenance.handler

import me.rakirahman.quality.maintenance.metadata._
import org.apache.spark.internal.Logging
import scala.collection.mutable.ListBuffer

/** Generates maintenance SQL scripts (VACUUM, OPTIMIZE, PURGE) for Delta
  * tables based on desired configurations.
  */
object DeltaMaintenanceScriptGenerator extends Logging {

  /** Generates maintenance scripts for all configured tables.
    *
    * @param currentTables
    *   The current tables in the estate (database, table pairs).
    * @param desiredConfigs
    *   The desired maintenance configurations.
    * @return
    *   A [[ListBuffer]] of [[DeltaMaintenanceScripts]] to execute.
    */
  def generateMaintenanceScripts(
      currentTables: Array[(String, String)],
      desiredConfigs: Array[DesiredDeltaTableConfig]
  ): ListBuffer[DeltaMaintenanceScripts] = {
    val scriptsToRun = ListBuffer.empty[DeltaMaintenanceScripts]

    desiredConfigs.foreach { desiredConfig =>
      val matchingTables = findMatchingTables(currentTables, desiredConfig)

      matchingTables.foreach { case (database, table) =>
        val script = ListBuffer.empty[String]

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

        if (script.nonEmpty && !scriptsToRun.exists(s =>
              s.databaseName == database && s.tableName == table
            )) {
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

  /** Finds tables in the estate that are NOT covered by any desired
    * configuration.
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
