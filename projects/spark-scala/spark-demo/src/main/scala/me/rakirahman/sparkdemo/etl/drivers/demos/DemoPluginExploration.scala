package me.rakirahman.sparkdemo.etl.drivers.demos

import com.azure.core.http.netty.NettyAsyncHttpClientBuilder
import com.azure.core.http.{HttpMethod, HttpRequest}

import java.net.URI

import me.rakirahman.spark.plugin.uncachingplugin.UncacherSparkPluginMetadata
import me.rakirahman.spark.SparkSessionManager
import me.rakirahman.sparkdemo.config.DemoEnvironmentConfiguration

import org.apache.spark.internal.Logging

/** Demonstrates interaction with various Spark Plugins.
  */
object DemoPluginExploration extends App with Logging {

  val configFileName = args.headOption.getOrElse {
    logError("No configuration file provided - exiting.")
    sys.exit(1)
  }
  val envConfig = DemoEnvironmentConfiguration(null, configFileName)
  val spark = SparkSessionManager(envConfig).session
  val httpClient = new NettyAsyncHttpClientBuilder().build()

  val df = spark.range(5000)

  val table = "test"
  logInfo(s"Creating a table: ${table}")
  df.createOrReplaceTempView(table)

  for (_ <- 1 to 5) {
    logDebug("Caching the table")
    spark.catalog.cacheTable(table)

    logDebug(s"DataFrame contains: ${df.count()} rows")

    logDebug("Requesting uncache")
    val response = httpClient.send(new HttpRequest(HttpMethod.POST, s"http://localhost:${UncacherSparkPluginMetadata.DEFAULT_PORT}/uncache/${table}")).block()

    logInfo(s"Response status code: ${response.getStatusCode}")
    logInfo(s"Response body: ${response.getBodyAsString().block()}")
  }

  logDebug("Stopping Spark Session")
  spark.stop()

  logInfo("Spark Session stopped")
}
