package me.rakirahman.spark.plugin.uncachingplugin

import java.io.IOException
import java.net.ServerSocket
import java.util

import fi.iki.elonen.NanoHTTPD
import org.apache.spark.SparkContext
import org.apache.spark.sql.SparkSession
import org.apache.spark.api.plugin.{DriverPlugin, ExecutorPlugin, PluginContext, SparkPlugin}

import org.apache.logging.log4j.{Logger, LogManager}

/** A simple HTTP server for caching operations using NanoHTTPD.
  *
  * @param port
  *   The port to serve on.
  */
class UncacheServer(port: Int) extends NanoHTTPD(port) {

  private val logger: Logger = LogManager.getLogger(this.getClass.getCanonicalName.stripSuffix("$"))

  /** @inheritdoc
    */
  override def serve(session: NanoHTTPD.IHTTPSession): NanoHTTPD.Response = {
    val uri = session.getUri
    val method = session.getMethod

    if (method == NanoHTTPD.Method.POST && uri.startsWith("/uncache/")) {
      val tableName = uri.stripPrefix("/uncache/")
      val spark = SparkSession.builder().getOrCreate()

      if (spark.catalog.tableExists(tableName)) {
        spark.catalog.uncacheTable(tableName)
        logger.info(s"Successfully uncached table: $tableName")
        NanoHTTPD.newFixedLengthResponse(NanoHTTPD.Response.Status.OK, "text/plain", s"Successfully uncached table: $tableName")
      } else {
        logger.warn(s"Table not found: $tableName")
        NanoHTTPD.newFixedLengthResponse(NanoHTTPD.Response.Status.NOT_FOUND, "text/plain", s"Table not found: $tableName")
      }
    } else {
      NanoHTTPD.newFixedLengthResponse(NanoHTTPD.Response.Status.NOT_FOUND, "text/plain", s"Invalid endpoint: ${uri}")
    }
  }
}

/** Declares a driver only plugin.
  */
class UncacherSparkPlugin extends SparkPlugin {

  /** @inheritdoc
    */
  override def driverPlugin(): DriverPlugin = new UncachingDriverPlugin

  /** @inheritdoc
    */
  override def executorPlugin(): ExecutorPlugin = null
}

/** Metadata for the UncacherSparkPlugin.
  */
object UncacherSparkPluginMetadata {
  val DEFAULT_PORT = 9999
}

/** A custom driver plugin that starts a long running thread in the driver process.
  */
class UncachingDriverPlugin extends DriverPlugin {

  val logger: Logger = LogManager.getLogger(this.getClass.getCanonicalName.stripSuffix("$"))

  var sparkContext: SparkContext = null
  var server: UncacheServer = null
  var serverThread: Thread = null

  /** @inheritdoc
    */
  override def init(
      sc: SparkContext,
      pluginContext: PluginContext
  ): util.Map[String, String] = {

    logger.debug("Initializing long-running server for a REST API")

    this.sparkContext = sc
    server = new UncacheServer(UncacherSparkPluginMetadata.DEFAULT_PORT)

    serverThread = new Thread(() => {
      try {
        server.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false)
        logger.info(s"Started NanoHTTPD server on port ${UncacherSparkPluginMetadata.DEFAULT_PORT}")
      } catch {
        case e: IOException => logger.error("Failed to start NanoHTTPD server", e)
      }
    })
    serverThread.setDaemon(true)
    serverThread.start()

    super.init(sc, pluginContext)
  }

  /** @inheritdoc
    */
  override def shutdown(): Unit = {
    logger.debug("Shutting down NanoHTTPD server and plugin")

    if (server != null) {
      server.stop()
      logger.info("NanoHTTPD server stopped")
    }

    if (serverThread != null) {
      serverThread.interrupt()
    }

    super.shutdown()
  }
}
