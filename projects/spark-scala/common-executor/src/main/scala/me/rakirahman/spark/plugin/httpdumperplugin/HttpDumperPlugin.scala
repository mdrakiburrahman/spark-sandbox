package me.rakirahman.spark.plugin.httpdumperplugin

import java.io.{BufferedWriter, File, FileWriter, IOException}
import java.util.UUID
import java.util.concurrent.ConcurrentLinkedQueue

import me.rakirahman.spark.plugin.httpdumperplugin.conf.HttpDumperConf

import fi.iki.elonen.NanoHTTPD
import org.apache.spark.SparkContext
import org.apache.spark.api.plugin.{DriverPlugin, ExecutorPlugin, PluginContext, SparkPlugin}
import org.apache.spark.internal.Logging

import scala.collection.JavaConverters._
import scala.util.{Failure, Success, Try}

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

/** A simple HTTP server that captures request metadata and buffers it locally.
  *
  * @param port
  *   The port to serve on.
  * @param requestBuffer
  *   The buffer to store captured request metadata.
  */
class HttpDumperServer(port: Int, requestBuffer: ConcurrentLinkedQueue[HttpRequestMetadata]) extends NanoHTTPD(port) with Logging {

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

      requestBuffer.offer(metadata)

      NanoHTTPD.newFixedLengthResponse(
        NanoHTTPD.Response.Status.OK,
        "text/plain",
        s"Request metadata captured: $method $uri"
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
  override def executorPlugin(): ExecutorPlugin = null
}

/** Driver plugin that starts an HTTP server, buffers request metadata, and flushes to JSONL on shutdown.
  */
class HttpDumperDriverPlugin extends DriverPlugin with Logging {

  var config: HttpDumperConf = _
  private val requestBuffer = new ConcurrentLinkedQueue[HttpRequestMetadata]()
  var server: HttpDumperServer = _
  var serverThread: Thread = _

  /** @inheritdoc
    */
  override def init(
      sc: SparkContext,
      ctx: PluginContext
  ): java.util.Map[String, String] = {
    config = HttpDumperConf(ctx.conf)
    logInfo(s"HttpDumperDriverPlugin initialized with config: location=${config.location}, port=${config.driverPort}")

    server = new HttpDumperServer(config.driverPort, requestBuffer)
    serverThread = new Thread(() => {
      try {
        server.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false)
        logInfo(s"Started HTTP dumper server on driver port ${config.driverPort}")
      } catch {
        case e: IOException => logError("Failed to start HTTP dumper server on driver", e)
      }
    })
    serverThread.setDaemon(true)
    serverThread.start()

    new java.util.HashMap[String, String]
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
      logInfo("Shutting down HttpDumperDriverPlugin...")

      if (server != null) {
        server.stop()
        logInfo("HTTP dumper server stopped")
      }

      if (serverThread != null) {
        serverThread.interrupt()
      }

      val requests = scala.collection.mutable.ListBuffer[HttpRequestMetadata]()
      while (!requestBuffer.isEmpty) {
        val request = requestBuffer.poll()
        if (request != null) {
          requests += request
        }
      }

      if (requests.nonEmpty) {
        val dir = new File(config.location)
        dir.mkdirs()

        val fileName = s"${UUID.randomUUID()}.json"
        val file = new File(dir, fileName)
        val writer = new BufferedWriter(new FileWriter(file))

        try {
          requests.foreach { request =>
            writer.write(request.requestBody)
            writer.newLine()
          }
        } finally {
          writer.close()
        }

        logInfo(s"Flushed ${requests.size} entries to ${file.getAbsolutePath}")
      } else {
        logInfo("No buffered requests to flush")
      }

      logInfo("HttpDumperDriverPlugin shutdown complete")
    } catch {
      case e: Exception =>
        logError("Error during HttpDumperDriverPlugin shutdown", e)
    }
  }
}
