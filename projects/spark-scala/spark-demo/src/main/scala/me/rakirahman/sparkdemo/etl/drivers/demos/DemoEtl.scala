package me.rakirahman.sparkdemo.etl.drivers.demos

import org.apache.spark.sql.Row
import org.apache.spark.sql.types._

import me.rakirahman.spark.SparkSessionExtensions._
import me.rakirahman.spark.SparkSessionManager
import me.rakirahman.sparkdemo.config.DemoEnvironmentConfiguration

import org.apache.spark.internal.Logging
import scala.concurrent.duration._

/** Simple ETL demo.
  */
object DemoEtl extends App with Logging {

  val configFileName = args.headOption.getOrElse {
    logError("No configuration file provided - exiting.")
    sys.exit(1)
  }
  val envConfig = DemoEnvironmentConfiguration(null, configFileName)
  val spark = SparkSessionManager(envConfig).session

  spark.sql("CREATE DATABASE IF NOT EXISTS sf")

  val schema = StructType(
    Array(
      StructField("vendor_id", LongType, true),
      StructField("trip_id", LongType, true),
      StructField("trip_distance", FloatType, true),
      StructField("fare_amount", DoubleType, true),
      StructField("store_and_fwd_flag", StringType, true)
    )
  )

  val data = Seq(
    Row(1L, 1000371L, 1.8f, 15.32, "N"),
    Row(2L, 1000372L, 2.5f, 22.15, "N"),
    Row(2L, 1000373L, 0.9f, 9.01, "N"),
    Row(1L, 1000374L, 8.4f, 42.13, "Y")
  )

  logInfo("APPEND-ing sample data into Delta table")
  spark
    .createDataFrame(spark.sparkContext.parallelize(data), schema)
    .write
    .format("delta")
    .mode("append")
    .saveAsTable("sf.waymo")

  spark.stopAfter(30.seconds)

}
