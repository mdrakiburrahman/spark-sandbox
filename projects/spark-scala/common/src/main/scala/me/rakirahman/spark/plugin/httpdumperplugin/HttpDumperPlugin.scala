package me.rakirahman.spark.plugin.httpdumperplugin

import java.io.IOException
import java.net.ServerSocket
import java.util
import java.util.concurrent.{ConcurrentLinkedQueue, Executors, ScheduledExecutorService, Semaphore, TimeUnit}
import java.sql.Timestamp
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

import me.rakirahman.spark.plugin.httpdumperplugin.conf.HttpDumperConf
import me.rakirahman.etl.transformer.sorter.{DateSorter, DateTypes, SortableColumnNames}

import fi.iki.elonen.NanoHTTPD
import org.apache.spark.SparkContext
import org.apache.spark.api.plugin.{DriverPlugin, ExecutorPlugin, PluginContext, SparkPlugin}
import org.apache.spark.internal.Logging
import org.apache.spark.sql.SparkSession

import scala.collection.JavaConverters._
import scala.util.{Failure, Success, Try}
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.scala.DefaultScalaModule

/** HTTP metadata captured from an incoming request.
  *
  * @param uri
  *   The request URI
  * @param method
  *   The HTTP method (GET, POST, etc.)
  * @param headers
  *   HTTP headers as a map
  * @param parameters
  *   Query parameters as a map
  * @param remoteIpAddress
  *   The remote IP address of the client
  * @param requestBody
  *   The request body content
  */
case class HttpRequestMetadata(
    uri: String,
    method: String,
    headers: Map[String, String],
    parameters: Map[String, List[String]],
    remoteIpAddress: String,
    requestBody: String
) extends Serializable

/** A simple HTTP server that captures request metadata and forwards it to the driver.
  *
  * @param port
  *   The port to serve on.
  * @param pluginContext
  *   The plugin context for RPC communication.
  */
class HttpDumperServer(port: Int, pluginContext: PluginContext) extends NanoHTTPD(port) with Logging {

  /** @inheritdoc
    */
  override def serve(session: NanoHTTPD.IHTTPSession): NanoHTTPD.Response = {
    try {
      val uri = session.getUri
      val method = session.getMethod.toString
      val remoteIpAddress = session.getRemoteIpAddress
      val headers = session.getHeaders.asScala.toMap
      val parameters = session.getParameters.asScala.map { case (k, v) => k -> v.asScala.toList }.toMap
      val requestBody = if (session.getMethod != NanoHTTPD.Method.GET && session.getMethod != NanoHTTPD.Method.HEAD) {
        try {
          val contentLength = session.getHeaders.get("content-length")
          if (contentLength != null && contentLength.toInt > 0) {
            val buffer = new Array[Byte](contentLength.toInt)
            val inputStream = session.getInputStream
            val bytesRead = inputStream.read(buffer)
            new String(buffer, 0, bytesRead, "UTF-8")
          } else {
            ""
          }
        } catch {
          case e: Exception =>
            logWarning(s"Failed to read request body: ${e.getMessage}")
            ""
        }
      } else {
        "" // GET/HEAD requests don't have bodies
      }

      val metadata = HttpRequestMetadata(
        uri = uri,
        method = method,
        headers = headers,
        parameters = parameters,
        remoteIpAddress = remoteIpAddress,
        requestBody = requestBody
      )

      pluginContext.send(metadata)
      logInfo(s"Sent HTTP request metadata to driver: $method $uri from $remoteIpAddress")

      NanoHTTPD.newFixedLengthResponse(
        NanoHTTPD.Response.Status.OK,
        "text/plain",
        s"Request metadata captured and sent to driver: $method $uri"
      )

    } catch {
      case e: Exception =>
        logError("Error processing HTTP request", e)
        NanoHTTPD.newFixedLengthResponse(
          NanoHTTPD.Response.Status.INTERNAL_ERROR,
          "text/plain",
          s"Error processing request: ${e.getMessage}"
        )
    }
  }
}

/** A Spark plugin that demonstrates HTTP request dumping from executors to driver.
  */
class HttpDumperPlugin extends SparkPlugin with Logging {

  /** @inheritdoc
    */
  override def driverPlugin(): DriverPlugin = new HttpDumperDriverPlugin

  /** @inheritdoc
    */
  override def executorPlugin(): ExecutorPlugin = new HttpDumperExecutorPlugin
}

/** Driver plugin that receives HTTP request metadata from executors.
  */
class HttpDumperDriverPlugin extends DriverPlugin with Logging {

  var config: HttpDumperConf = _
  private val requestBuffer = new ConcurrentLinkedQueue[HttpRequestMetadata]()
  private val bufferSemaphore = new Semaphore(1)
  private var scheduledExecutor: ScheduledExecutorService = _
  private val objectMapper = new ObjectMapper()
  private var tableCreated = false

  objectMapper.registerModule(DefaultScalaModule)

  /** @inheritdoc
    */
  override def init(
      sc: SparkContext,
      ctx: PluginContext
  ): java.util.Map[String, String] = {
    config = HttpDumperConf(ctx.conf)

    logInfo(s"HttpDumperDriverPlugin initialized with config: database=${config.databaseName}, table=${config.tableName}, format=${config.tableFormat}, flushTimeout=${config.flushTimeoutSeconds}s")

    scheduledExecutor = Executors.newSingleThreadScheduledExecutor()
    scheduledExecutor.scheduleAtFixedRate(
      () => flushBuffer(),
      config.flushTimeoutSeconds,
      config.flushTimeoutSeconds,
      TimeUnit.SECONDS
    )

    new java.util.HashMap[String, String]
  }

  private def createTableIfNotExists(sparkSession: SparkSession): Unit = {
    try {
      val database = config.databaseName
      val table = config.tableName
      val tableFormat = config.tableFormat

      sparkSession.sql(s"CREATE DATABASE IF NOT EXISTS $database")
      sparkSession.sql(
        s"""
           |CREATE TABLE IF NOT EXISTS $database.$table (
           |  -- Timestamp columns
           |  result_timestamp TIMESTAMP,
           |  result_timestamp_long LONG,
           |  ${SortableColumnNames.YEAR_MONTH_DATE_EVENT.toString} STRING,
           |  
           |  -- HTTP Request metadata columns
           |  request_uri STRING,
           |  request_method STRING,
           |  request_headers_json STRING,
           |  request_parameters_json STRING,
           |  remote_ip_address STRING,
           |  request_body STRING
           |)
           |USING $tableFormat
           |PARTITIONED BY (
           |  ${SortableColumnNames.YEAR_MONTH_DATE_EVENT.toString},
           |  request_uri
           |)
           |""".stripMargin
      )
    } catch {
      case e: Exception =>
        logError("Failed to create database/table", e)
    }
  }

  private def flushBuffer(): Unit = {
    if (requestBuffer.isEmpty) return

    Try {
      bufferSemaphore.acquire()
      val requests = scala.collection.mutable.ListBuffer[HttpRequestMetadata]()

      while (!requestBuffer.isEmpty) {
        val request = requestBuffer.poll()
        if (request != null) {
          requests += request
        }
      }

      if (requests.nonEmpty) {
        try {
          val sparkSession = SparkSession.builder().getOrCreate()
          
          if (!sparkSession.sparkContext.isStopped) {
            if (!tableCreated) {
              createTableIfNotExists(sparkSession)
              tableCreated = true
            }
            
            insertRequests(requests.toList, sparkSession)
            logInfo(s"Flushed ${requests.size} HTTP requests to database")
          } else {
            logWarning(s"SparkContext is stopped, unable to flush ${requests.size} HTTP requests. Requests will be lost.")
          }
        } catch {
          case _: IllegalStateException =>
            logWarning(s"SparkContext is stopped, unable to flush ${requests.size} HTTP requests. Requests will be lost.")
          case e: Exception =>
            logError(s"Error getting SparkSession, unable to flush ${requests.size} HTTP requests", e)
        }
      }
    } match {
      case Success(_) =>
      case Failure(e) => logError("Failed to flush buffer", e)
    }

    bufferSemaphore.release()
  }

  private def insertRequests(requests: List[HttpRequestMetadata], sparkSession: SparkSession): Unit = {
    try {
      val database = config.databaseName
      val table = config.tableName
      val currentTime = Timestamp.valueOf(LocalDateTime.now())
      val currentTimeLong = currentTime.getTime
      val yearMonthDate = DateSorter.convert(currentTime, DateTypes.YearMonthDate)

      requests.foreach { request =>
        val headersJson = objectMapper.writeValueAsString(request.headers)
        val parametersJson = objectMapper.writeValueAsString(request.parameters)

        sparkSession.sql(
          s"""
             |INSERT INTO $database.$table (
             |  result_timestamp,
             |  result_timestamp_long,
             |  ${SortableColumnNames.YEAR_MONTH_DATE_EVENT.toString},
             |  request_uri,
             |  request_method,
             |  request_headers_json,
             |  request_parameters_json,
             |  remote_ip_address,
             |  request_body
             |) VALUES (
             |  CAST('${currentTime}' AS TIMESTAMP),
             |  ${currentTimeLong}L,
             |  '${yearMonthDate}',
             |  '${escapeSql(request.uri)}',
             |  '${request.method}',
             |  '${escapeSql(headersJson)}',
             |  '${escapeSql(parametersJson)}',
             |  '${request.remoteIpAddress}',
             |  '${escapeSql(request.requestBody)}'
             |)
             |""".stripMargin
        )
      }
    } catch {
      case e: Exception =>
        logError("Failed to insert requests into database", e)
    }
  }

  private def escapeSql(value: String): String = {
    if (value == null) "" else value.replace("'", "''").replace("\\", "\\\\")
  }

  /** @inheritdoc
    */
  override def receive(message: scala.Any): AnyRef = {
    message match {
      case metadata: HttpRequestMetadata =>
        requestBuffer.offer(metadata)
        Unit
      case _ =>
        logWarning(s"Received unexpected message type: ${message.getClass.getSimpleName}")
        Unit
    }
  }

  override def shutdown(): Unit = {
    try {
      logInfo("Shutting down HttpDumperDriverPlugin, flushing remaining requests...")

      if (scheduledExecutor != null) {
        scheduledExecutor.shutdown()
        if (!scheduledExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
          logWarning("Scheduled executor did not terminate gracefully, forcing shutdown")
          scheduledExecutor.shutdownNow()
        }
      }

      try {
        flushBuffer()
      } catch {
        case _: IllegalStateException =>
          logWarning("SparkContext already stopped, unable to flush remaining requests")
        case e: Exception =>
          logError("Error during final flush", e)
      }

      logInfo("HttpDumperDriverPlugin shutdown complete")
    } catch {
      case e: Exception =>
        logError("Error during HttpDumperDriverPlugin shutdown", e)
    }
  }
}

/** Executor plugin that starts an HTTP server and forwards request metadata to the driver.
  */
class HttpDumperExecutorPlugin extends ExecutorPlugin with Logging {

  var pluginContext: PluginContext = null
  var server: HttpDumperServer = null
  var serverThread: Thread = null
  var config: HttpDumperConf = _

  /** @inheritdoc
    */
  override def init(ctx: PluginContext, extraConf: util.Map[String, String]): Unit = {
    config = HttpDumperConf(ctx.conf)
    logInfo(s"HttpDumperExecutorPlugin initialized with port: ${config.executorPort}, flushTimeout: ${config.flushTimeoutSeconds}s")

    this.pluginContext = ctx
    server = new HttpDumperServer(config.executorPort, pluginContext)

    serverThread = new Thread(() => {
      try {
        server.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false)
        logInfo(s"Started HTTP dumper server on port ${config.executorPort}")
      } catch {
        case e: IOException => logError("Failed to start HTTP dumper server", e)
      }
    })
    serverThread.setDaemon(true)
    serverThread.start()
  }

  /** @inheritdoc
    */
  override def shutdown(): Unit = {
    logDebug("Shutting down HTTP dumper server and plugin")

    if (server != null) {
      server.stop()
      logInfo("HTTP dumper server stopped")
    }

    if (serverThread != null) {
      serverThread.interrupt()
    }
  }
}
