package me.rakirahman.spark

import org.apache.spark.internal.Logging
import org.apache.spark.sql.{DataFrame, SparkSession}

import scala.util.{Failure, Success, Try}
import scala.io.Source

object SparkSessionExtensions extends Logging {

  implicit class SparkConfigTransformer(spark: SparkSession) {

    /** Injects Fabric SQL-friendly configuration into the SparkSession.
      *
      * @return
      *   The SparkSession with Fabric SQL configuration injected.
      */
    def withFabricSqlConfigInjected(): SparkSession = {

      // Fabric SQL cannot perform rowgroup elimination on int96 TIMESTAMP columns,
      // because the min/max stats are not written in the actual Parquet file.
      //
      // Since Fabric SQL purges the statistics in the Delta Log during it's
      // Metadata Sync, if the Parquet doesn't have the statistics, Fabric SQL
      // will not be able to perform rowgroup elimination, which results in
      // extremely slow queries due to full scans.
      //
      // >>> SO: https://stackoverflow.com/questions/56582539/how-to-save-spark-dataframe-to-parquet-without-using-int96-format-for-timestamp
      //
      spark.sql("set spark.sql.parquet.outputTimestampType=TIMESTAMP_MICROS")
      spark.sql("set spark.sql.parquet.datetimeRebaseModeInWrite=CORRECTED")

      spark
    }

    /** Converts the Spark Config into a [[DataFrame]].
      *
      * @return
      *   The [[DataFrame]] containing the Spark Config.
      */
    def withConfigurationAsDataFrame(): DataFrame = {
      import spark.implicits._
      spark.sparkContext.getConf.getAll.sorted.toSeq.toDF("key", "value")
    }

    /** Flushes the HttpDumperPlugin buffer by calling the driver's REST API /flush endpoint.
      *
      * This method blocks until the flush operation completes. It reads the driver port from the Spark configuration and makes an HTTP GET request to the /flush endpoint.
      */
    def flushPlugin(): Unit = {
      val driverPort = spark.conf.getOption("spark.plugin.conf.driver.port").getOrElse("19000")
      val url = s"http://localhost:$driverPort/flush"

      logInfo(s"Flushing plugin buffer via $url")

      try {
        val response = Source.fromURL(url).mkString
        logInfo(s"Plugin flush response: $response")
      } catch {
        case e: Exception =>
          logError(s"Failed to flush plugin buffer", e)
          throw e
      }
    }
  }
}
