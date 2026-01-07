package me.rakirahman.spark.plugin.httpdumperplugin

import java.io.IOException
import java.net.ServerSocket
import java.util

import fi.iki.elonen.NanoHTTPD

import org.apache.spark.SparkContext
import org.apache.spark.api.plugin.{DriverPlugin, ExecutorPlugin, PluginContext, SparkPlugin}
import org.apache.spark.internal.Logging

import scala.collection.JavaConverters._

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
  */
case class HttpRequestMetadata(
    uri: String,
    method: String,
    headers: Map[String, String],
    parameters: Map[String, List[String]],
    remoteIpAddress: String
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

      val metadata = HttpRequestMetadata(
        uri = uri,
        method = method,
        headers = headers,
        parameters = parameters,
        remoteIpAddress = remoteIpAddress
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

/** Metadata for the HttpDumperPlugin.
  */
object HttpDumperPluginMetadata {
  val DEFAULT_PORT = 9003
}

/** Driver plugin that receives HTTP request metadata from executors.
  */
class HttpDumperDriverPlugin extends DriverPlugin with Logging {

  /** @inheritdoc
    */
  override def receive(message: scala.Any): AnyRef = {
    message match {
      case metadata: HttpRequestMetadata =>
        logInfo(s"Received HTTP request metadata from executor:")
        logInfo(s"  URI: ${metadata.uri}")
        logInfo(s"  Method: ${metadata.method}")
        logInfo(s"  Remote IP: ${metadata.remoteIpAddress}")
        logInfo(s"  Headers: ${metadata.headers}")
        logInfo(s"  Parameters: ${metadata.parameters}")
        Unit
      case _ =>
        logWarning(s"Received unexpected message type: ${message.getClass.getSimpleName}")
        Unit
    }
  }
}

/** Executor plugin that starts an HTTP server and forwards request metadata to the driver.
  */
class HttpDumperExecutorPlugin extends ExecutorPlugin with Logging {

  var pluginContext: PluginContext = null
  var server: HttpDumperServer = null
  var serverThread: Thread = null

  /** @inheritdoc
    */
  override def init(ctx: PluginContext, extraConf: util.Map[String, String]): Unit = {
    logDebug("Initializing HTTP dumper server on executor")

    this.pluginContext = ctx
    server = new HttpDumperServer(HttpDumperPluginMetadata.DEFAULT_PORT, pluginContext)

    serverThread = new Thread(() => {
      try {
        server.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false)
        logInfo(s"Started HTTP dumper server on port ${HttpDumperPluginMetadata.DEFAULT_PORT}")
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
