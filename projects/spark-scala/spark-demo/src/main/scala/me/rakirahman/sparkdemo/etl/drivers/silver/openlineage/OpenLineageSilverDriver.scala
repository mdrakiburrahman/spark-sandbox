package me.rakirahman.sparkdemo.etl.drivers.silver.openlineage

import me.rakirahman.metastore.sql.SqlMetastoreOperations
import me.rakirahman.spark.SparkSessionManager
import me.rakirahman.sparkdemo.config.DemoEnvironmentConfiguration
import me.rakirahman.sparkdemo.etl.loader.silver.openlineage._

import org.apache.spark.internal.Logging
import org.apache.spark.sql.streaming.Trigger

/** Driver for streaming OpenLineage JSONL files into a denormalized columnar Silver table.
  */
object OpenLineageSilverDriver extends App with Logging {

  val driverName = this.getClass.getSimpleName.stripSuffix("$")
  val Array(
    configFileName,
    inputDestinationDatabase,
    inputSourcePath,
    inputArchivePath
  ) = args

  require(
    (configFileName != null && configFileName.nonEmpty) &&
      (inputDestinationDatabase != null && inputDestinationDatabase.nonEmpty) &&
      (inputSourcePath != null && inputSourcePath.nonEmpty) &&
      (inputArchivePath != null && inputArchivePath.nonEmpty),
    "Input args must not be null or empty"
  )

  val envConfig = DemoEnvironmentConfiguration(driverName, configFileName)
  val spark = SparkSessionManager(envConfig).session
  val sqlMetastoreOperations = SqlMetastoreOperations(spark)

  sqlMetastoreOperations.createDatabase(inputDestinationDatabase)

  val transformer = new OpenLineageSilverTransformer()

  val trigger = if (envConfig.LocalSpark) {
    Trigger.AvailableNow
  } else {
    Trigger.ProcessingTime("0 seconds")
  }

  val loader = OpenLineageSilverLoader(spark, inputSourcePath, inputArchivePath)

  logInfo(s"Starting OpenLineage Silver streaming from ${inputSourcePath} to ${inputDestinationDatabase} (archive: ${inputArchivePath})")

  val query = loader
    .load()
    .writeStream
    .format("delta")
    .outputMode("append")
    .option(
      "checkpointLocation",
      s"${envConfig.CheckpointsRootPath}/${inputDestinationDatabase}/${OpenLineageSilverTableMetadata.TableSilverOpenLineage}"
    )
    .trigger(trigger)
    .foreachBatch { (batchDF: org.apache.spark.sql.DataFrame, batchId: Long) =>
      val result = transformer.transformBatch(batchDF, batchId)
      if (!result.isEmpty) {
        result.write
          .format("delta")
          .mode("append")
          .option("mergeSchema", "true")
          .partitionBy(OpenLineageSilverTableMetadata.OutputPartitions: _*)
          .saveAsTable(
            s"${inputDestinationDatabase}.${OpenLineageSilverTableMetadata.TableSilverOpenLineage}"
          )
      }
    }
    .start()

  logInfo(s"Stream started with trigger: ${trigger}")
  query.awaitTermination()

  spark.stop()
  logInfo("OpenLineage Silver Driver completed.")
}
