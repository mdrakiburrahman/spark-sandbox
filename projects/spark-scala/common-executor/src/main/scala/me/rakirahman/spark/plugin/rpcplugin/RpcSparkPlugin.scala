package me.rakirahman.spark.plugin.rpcplugin

import java.util

import org.apache.spark.api.plugin.{DriverPlugin, ExecutorPlugin, PluginContext, SparkPlugin}
import org.apache.spark.internal.Logging

/** Request object for initial configuration from executor to driver.
  */
case object InitialConfigRequest extends Serializable

/** Response containing initial configuration value.
  *
  * @param value
  *   The configuration value to be used by executors.
  */
case class InitialConfigResponse(value: Int) extends Serializable

/** Response containing the final computed value.
  *
  * @param value
  *   The final computed value from executor.
  */
case class FinalValueResponse(value: Int) extends Serializable

/** RPC message for communication between driver and executor.
  *
  * @param message
  *   The message content.
  */
case class RpcMessage(message: String) extends Serializable

/** A Spark plugin that demonstrates RPC communication between driver and executors.
  */
class RpcSparkPlugin extends SparkPlugin with Logging {

  /** @inheritdoc
    */
  override def driverPlugin(): DriverPlugin = new DriverPlugin {

    /** @inheritdoc
      */
    override def receive(message: scala.Any): AnyRef = {
      message match {
        case InitialConfigRequest      => InitialConfigResponse(10)
        case FinalValueResponse(value) => logInfo(s"the final value is $value"); Unit

      }
    }
  }

  /** @inheritdoc
    */
  override def executorPlugin(): ExecutorPlugin = new ExecutorPlugin {
    var pluginContext: PluginContext = null
    var initialConfiguration: Int = 0

    /** @inheritdoc
      */
    override def init(ctx: PluginContext, extraConf: util.Map[String, String]): Unit = {
      pluginContext = ctx
      initialConfiguration = pluginContext.ask(InitialConfigRequest).asInstanceOf[InitialConfigResponse].value
      logInfo(s"the initial configuration we received from the driver is $initialConfiguration")
    }

    /** @inheritdoc
      */
    override def shutdown(): Unit = {
      val rpcMessage = FinalValueResponse(10 * initialConfiguration)
      pluginContext.send(rpcMessage)
    }
  }
}
