package me.rakirahman.sparkdemo.etl.drivers.demos

import me.rakirahman.lineage.openlineage.{OpenLineageExtractor, OpenLineageLineage}
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
  val lineage = extractor.getLineage()

  allTables.toSeq.sortBy(_._1).foreach { case (db, tables) =>
    tables.sorted.foreach { table =>
      val fqn = s"$db.$table"
      val filtered = OpenLineageExtractor.filterLineageForDataset(lineage, table)
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

  val uberMermaid = OpenLineageExtractor.toMermaid(lineage, "UBER Lineage (All Tables)")

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
