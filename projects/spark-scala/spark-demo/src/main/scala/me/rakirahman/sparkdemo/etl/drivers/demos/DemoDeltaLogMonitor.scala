package me.rakirahman.sparkdemo.etl.drivers.demos

import me.rakirahman.deltalog.{DeltaLogCommitStore, DeltaLogExtractor, DeltaLogKpiEngine, DeltaLogVisualization, DeltaLogEstateKpis, DeltaLogKpiResult, FreshnessAssessment, CompletenessAssessment, OperationalMetrics}
import me.rakirahman.logging.LoggingConstants
import me.rakirahman.metastore.sql.SqlMetastoreOperations
import me.rakirahman.spark.SparkSessionManager
import me.rakirahman.sparkdemo.config.DemoEnvironmentConfiguration

import org.apache.spark.internal.Logging

/** Demonstrates the Delta Transaction Log KPI monitoring system.
  *
  * Extracts commit history from all Delta tables in the estate, persists to inventory tables, computes freshness / completeness / operational KPIs, and generates Mermaid visualizations and text health reports.
  */
object DemoDeltaLogMonitor extends App with Logging {
  val configFileName = args.headOption.getOrElse(sys.exit(1))
  val envConfig = DemoEnvironmentConfiguration(null, configFileName)
  val spark = SparkSessionManager(envConfig).session
  val metastoreOps = SqlMetastoreOperations(spark)
  val inventoryDb = DeltaLogExtractor.DefaultInventoryDatabase

  // Step 1: Extract new commits (incremental via high-water mark)
  logInfo("Step 1: Extracting Delta Transaction Log commits...")
  val extractor = DeltaLogExtractor(spark, inventoryDb)
  val newCommits = extractor.extract()
  logInfo(s"Extracted ${newCommits.size} new commits across the estate")

  // Step 2: Persist to inventory tables
  logInfo("Step 2: Persisting to inventory tables...")
  val store = new DeltaLogCommitStore(spark, metastoreOps, inventoryDb)
  store.persistCommitHistory(newCommits)
  store.captureTableSnapshots()

  // Step 3: Compute KPIs
  logInfo("Step 3: Computing KPIs...")
  val kpiEngine = DeltaLogKpiEngine(spark, inventoryDb, lookbackDays = 30)
  val kpiResults = kpiEngine.computeAll()
  kpiResults.show(100, truncate = false)

  // Step 4: Persist KPI results
  import org.apache.spark.sql.functions._
  val snapshotDate = java.time.LocalDate
    .now()
    .format(java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd"))

  kpiResults
    .withColumn("snapshot_date", lit(snapshotDate))
    .write
    .format("delta")
    .mode("append")
    .partitionBy("snapshot_date")
    .saveAsTable(s"$inventoryDb.kpi_results")

  // Step 5: Generate visualizations
  logInfo("Step 5: Generating visualizations...")
  val allTables = metastoreOps.listAllDatabasesAndTables()
  val totalTables = allTables.values.map(_.length).sum

  val mermaid =
    s"graph TD\n    %% Estate: $totalTables tables, ${newCommits.size} new commits extracted\n"

  val sb = new StringBuilder
  sb.append(s"${LoggingConstants.mainDivider}")
  sb.append(s"${LoggingConstants.subDivider}")
  sb.append("Delta Transaction Log KPI Results")
  sb.append(s"${LoggingConstants.subDivider}\n")
  sb.append(s"Tables scanned: $totalTables\n")
  sb.append(s"New commits extracted: ${newCommits.size}\n")
  sb.append(s"${LoggingConstants.subDivider}")
  sb.append(mermaid)
  sb.append(s"${LoggingConstants.mainDivider}")
  logInfo(sb.toString())

  spark.stop()
}
