package me.rakirahman.spark

import org.apache.spark.internal.Logging
import org.apache.spark.sql.{DataFrame, SparkSession}

import scala.concurrent.duration._
import scala.util.{Failure, Success, Try}

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

    /** Stops the Spark session after a specified duration.
      *
      * This method will sleep for the specified number of seconds and then call stop() on the SparkSession. Useful for testing or controlled execution scenarios.
      *
      * @param seconds
      *   Number of seconds to wait before stopping the Spark session
      */
    def stopAfter(seconds: Int): Unit = {
      logInfo(s"Scheduling Spark session stop after $seconds seconds...")
      Thread.sleep(seconds * 1000L)
      spark.stop()
    }

    /** Stops the Spark session after a specified duration (using Scala Duration).
      *
      * @param duration
      *   Duration to wait before stopping the Spark session
      */
    def stopAfter(duration: Duration): Unit = {
      stopAfter(duration.toSeconds.toInt)
    }
  }
}
