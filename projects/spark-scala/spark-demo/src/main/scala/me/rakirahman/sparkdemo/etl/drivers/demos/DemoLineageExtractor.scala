package me.rakirahman.sparkdemo.etl.drivers.demos

import me.rakirahman.lineage.openlineage.OpenLineageExtractor
import me.rakirahman.logging.LoggingConstants
import me.rakirahman.metastore.sql.SqlMetastoreOperations
import me.rakirahman.spark.SparkSessionManager
import me.rakirahman.sparkdemo.config.DemoEnvironmentConfiguration

import org.apache.spark.internal.Logging

object DemoLineageExtractor extends App with Logging {
  val configFileName = args.headOption.getOrElse(sys.exit(1))
  val envConfig = DemoEnvironmentConfiguration(null, configFileName)
  val spark = SparkSessionManager(envConfig).session
  val metastoreOps = SqlMetastoreOperations(spark)

  val allTables = metastoreOps.listAllDatabasesAndTables()
  logInfo(s"Found ${allTables.size} databases with ${allTables.values.map(_.length).sum} tables")
  val extractor = OpenLineageExtractor(spark)
  val rawLineage = extractor.getLineage()

  val locationMap = OpenLineageExtractor.buildLocationMap(metastoreOps, allTables)
  val lineage = OpenLineageExtractor.resolveDatasetNames(rawLineage, locationMap)

  val tablesWithNoLineage = scala.collection.mutable.ListBuffer.empty[String]

  allTables.toSeq.sortBy(_._1).foreach { case (db, tables) =>
    tables.sorted.foreach { table =>
      val fqn = s"$db.$table"
      val filtered = OpenLineageExtractor.filterLineageForDataset(lineage, fqn, table)

      if (filtered.tableEdges.isEmpty) {
        tablesWithNoLineage += fqn
      } else {
        val mermaid = OpenLineageExtractor.toMermaid(filtered, s"Lineage for $fqn")

        val sb = new StringBuilder
        sb.append(s"${LoggingConstants.mainDivider}")
        sb.append(s"${LoggingConstants.subDivider}")
        sb.append(s"Lineage for: $fqn")
        sb.append(s"${LoggingConstants.subDivider}\n")
        sb.append(s"Use your browser to paste this into >>> https://www.mermaidflow.app/editor")
        sb.append(s"${LoggingConstants.subDivider}")
        sb.append(mermaid)
        sb.append(s"${LoggingConstants.mainDivider}")
        logInfo(sb.toString())
      }
    }
  }

  if (tablesWithNoLineage.nonEmpty) {
    val noLineageSb = new StringBuilder
    noLineageSb.append(s"${LoggingConstants.mainDivider}")
    noLineageSb.append(s"${LoggingConstants.subDivider}")
    noLineageSb.append(s"Tables with no lineage (${tablesWithNoLineage.size}):")
    noLineageSb.append(s"${LoggingConstants.subDivider}")
    tablesWithNoLineage.foreach(t => noLineageSb.append(s"  - $t\n"))
    noLineageSb.append(s"${LoggingConstants.mainDivider}")
    logInfo(noLineageSb.toString())
  }

  val allTableLabels = allTables.toSeq.flatMap { case (db, tables) =>
    tables.map(t => s"$db.$t")
  }

  val uberMermaid = OpenLineageExtractor.toMermaid(
    lineage,
    "UBER Lineage (All Tables)",
    standaloneDatasets = allTableLabels
  )

  val sb = new StringBuilder
  sb.append(s"${LoggingConstants.mainDivider}")
  sb.append(s"${LoggingConstants.subDivider}")
  sb.append("UBER Lineage (All Tables)")
  sb.append(s"${LoggingConstants.subDivider}\n")
  sb.append(s"Use your browser to paste this into >>> https://www.mermaidflow.app/editor")
  sb.append(s"${LoggingConstants.subDivider}")
  sb.append(uberMermaid)
  sb.append(s"${LoggingConstants.mainDivider}")
  logInfo(sb.toString())

  spark.stop()
}
