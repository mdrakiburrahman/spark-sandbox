package me.rakirahman.spark.plugin.adlsoauthtokenproviderplugin

import java.io.{File, PrintWriter}

import me.rakirahman.secret.SparkPluginSecretManager
import me.rakirahman.spark.plugin.adlsoauthtokenproviderplugin.conf.AdlsOAuthTokenProviderConf

import org.apache.spark.SparkContext
import org.apache.spark.api.plugin.{DriverPlugin, ExecutorPlugin, PluginContext, SparkPlugin}
import org.apache.spark.internal.Logging

/** A Spark plugin that fetches a secret from Azure Key Vault at driver startup and writes it to a local file.
  *
  * The secret is resolved through [[SparkPluginSecretManager]], which selects a runtime-appropriate handler (Key Vault via the Azure CLI login locally, mssparkutils on Synapse/Fabric).
  */
class AdlsOAuthTokenProviderPlugin extends SparkPlugin with Logging {

  /** @inheritdoc
    */
  override def driverPlugin(): DriverPlugin =
    new AdlsOAuthTokenProviderDriverPlugin

  /** @inheritdoc
    */
  override def executorPlugin(): ExecutorPlugin = null
}

/** Driver plugin that resolves the runtime, fetches the configured secret via [[SparkPluginSecretManager]], and dumps it to the configured output path.
  */
class AdlsOAuthTokenProviderDriverPlugin extends DriverPlugin with Logging {

  /** @inheritdoc
    */
  override def init(
      sc: SparkContext,
      ctx: PluginContext
  ): java.util.Map[String, String] = {
    val config = AdlsOAuthTokenProviderConf(ctx.conf)
    logInfo(
      s"AdlsOAuthTokenProviderDriverPlugin initializing: runtime=${config.runtime}, vaultUrl=${config.vaultUrl}, secretName=${config.secretName}"
    )

    try {
      val manager = SparkPluginSecretManager(
        runtime = config.runtime,
        vaultUrl = config.vaultUrl,
        linkedServiceName = config.linkedServiceName
      )
      val secret = manager.getSecret(config.secretName)
      writeSecret(config.outputPath, secret)
      logInfo(s"Wrote secret '${config.secretName}' to ${config.outputPath}")
    } catch {
      case e: Exception =>
        logError(
          s"Failed to fetch secret '${config.secretName}' from ${config.vaultUrl}",
          e
        )
    }

    new java.util.HashMap[String, String]
  }

  /** @inheritdoc
    */
  override def shutdown(): Unit = ()

  /** Writes the secret value to the given path, creating parent directories.
    *
    * @param outputPath
    *   The destination file path.
    * @param secret
    *   The secret value to write.
    */
  private def writeSecret(outputPath: String, secret: String): Unit = {
    val file = new File(outputPath)
    Option(file.getParentFile).foreach(_.mkdirs())
    val writer = new PrintWriter(file, "UTF-8")
    try {
      writer.write(secret)
    } finally {
      writer.close()
    }
  }
}
