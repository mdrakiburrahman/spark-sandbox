package me.rakirahman.sparkdemo.etl.drivers.general.management

import me.rakirahman.config.DeltaLakeConfiguration
import me.rakirahman.feeds.storage.filesystem.FileSystemHandlerFactory
import me.rakirahman.logging.LoggingConstants
import me.rakirahman.metastore.sql.SqlMetastoreOperations
import me.rakirahman.parser.yaml.YamlParser
import me.rakirahman.spark.SparkSessionManager
import me.rakirahman.sparkdemo.config.DemoEnvironmentConfiguration

import org.apache.spark.internal.Logging

import scala.collection.mutable

/** Discovers and mounts existing Delta tables from configured root paths into the warehouse metastore.
  */
// @formatter:off
object DeltaMountDriver extends App with Logging {

  val driverName = this.getClass.getSimpleName.stripSuffix("$")
  val Array(configFileName) = args
  require(configFileName != null && configFileName.nonEmpty, "Config file name must not be null or empty")

  val envConfig = DemoEnvironmentConfiguration(driverName, configFileName)
  val driverOpts = YamlParser.loadClass(envConfig.RuntimeConfig, classOf[DeltaMountDriverSettings])
  driverOpts.validate

  val spark = SparkSessionManager(envConfig).session
  val sqlMetastoreOperations = SqlMetastoreOperations(spark)
  val fileSystemHandler = FileSystemHandlerFactory.createEnvironmentSpecificHandler(envConfig)

  val databaseTablesMap = mutable.Map[String, mutable.ArrayBuffer[String]]()
  var sb = new StringBuilder

  logInfo(s"Processing ${driverOpts.DeltaMountDriver.Mounts.length} mount configurations")

  driverOpts.DeltaMountDriver.Mounts.foreach { mount =>
    val database = mount.Database
    val rootPath = mount.RootPath

    logInfo(s"Processing mount: database=${database}, rootPath=${rootPath}")

    // Create database if it does not exist
    sqlMetastoreOperations.createDatabase(database)
    logInfo(s"Created database (if not exists): ${database}")

    if (fileSystemHandler.exists(rootPath)) {
      val tables = mutable.ArrayBuffer[String]()
      val tableDirs = fileSystemHandler.ls(rootPath)
        .filter(_.isDir)

      tableDirs.foreach { tableDir =>
        val deltaLogPath = s"${tableDir.path}/${DeltaLakeConfiguration.DELTA_LOG}"
        if (fileSystemHandler.exists(deltaLogPath)) {
          tables += tableDir.name
          logInfo(s"  Found Delta table: ${tableDir.name}")
        }
      }

      if (tables.nonEmpty) {
        databaseTablesMap(database) = tables
      }
    } else {
      logInfo(s"  Root path does not exist: ${rootPath}")
    }
  }

  sb = new StringBuilder
  sb.append(LoggingConstants.mainDivider)
  sb.append(s"Delta Table Discovery Complete\n")
  sb.append(LoggingConstants.subDivider)
  sb.append(s"Found ${databaseTablesMap.size} databases with Delta tables:\n")
  sb.append(LoggingConstants.subDivider)

  databaseTablesMap.toSeq.sortBy(_._1).foreach { case (database, tables) =>
    sb.append(s"Database: $database\n")
    sb.append(s"  Tables (${tables.size}):\n")
    tables.sorted.foreach { table =>
      sb.append(s"    - $table\n")
    }
    sb.append(LoggingConstants.subDivider)
  }

  sb.append(s"Total Delta tables found: ${databaseTablesMap.values.map(_.size).sum}\n")
  sb.append(LoggingConstants.mainDivider)
  logInfo(sb.toString())

  var mountCount = 0
  val totalTables = databaseTablesMap.values.map(_.size).sum

  // Build a map of database -> rootPath for mounting
  val databaseRootPathMap = driverOpts.DeltaMountDriver.Mounts.map(m => m.Database -> m.RootPath).toMap

  databaseTablesMap.toSeq.sortBy(_._1).foreach { case (database, tables) =>
    val rootPath = databaseRootPathMap(database)
    tables.sorted.foreach { tableName =>
      mountCount += 1
      val tablePath = s"${rootPath}/${tableName}"

      logInfo(s"[${mountCount}/${totalTables}]: Mounting {${database} - ${tableName}} at ${tablePath}")

      sqlMetastoreOperations.createDeltaTable(
        database,
        tableName,
        tablePath
      )
    }
  }
  logInfo(s"Successfully mounted ${mountCount} Delta tables to metastore")
}
// @formatter:on
