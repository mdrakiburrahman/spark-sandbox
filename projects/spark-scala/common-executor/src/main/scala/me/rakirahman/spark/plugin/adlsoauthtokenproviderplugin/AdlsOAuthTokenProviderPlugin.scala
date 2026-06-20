package me.rakirahman.spark.plugin.adlsoauthtokenproviderplugin

import me.rakirahman.feeds.authentication.callback.storage.StorageOAuthHadoopKeys
import me.rakirahman.secret.entra.credential.providers.{ProviderConfig, SupportedProviderTypes}
import me.rakirahman.spark.plugin.adlsoauthtokenproviderplugin.conf.{AdlsOAuthAccountConf, AdlsOAuthTokenProviderConf}

import org.apache.hadoop.conf.Configuration
import org.apache.spark.SparkContext
import org.apache.spark.api.plugin.{DriverPlugin, ExecutorPlugin, PluginContext, SparkPlugin}
import org.apache.spark.internal.Logging

/** A Spark plugin that wires per-storage-account ABFS OAuth at driver startup so Spark can talk to ADLS Gen2 / OneLake directly over `abfss://` without mounting.
  *
  * For each configured account the driver plugin stamps the Hadoop Configuration to use a `Custom` ABFS auth scheme backed by one of our `CustomTokenProviderAdaptee` implementations. The committed Spark conf stays terse — only the per-account `endpoint` + `authType`, plus the shared Key Vault
  * coordinates (`vaultUrl`, `configSecretBase64Name`). For the secret-backed auth types (`sni`, `relay`) the plugin stamps those coordinates + the runtime so the token provider can fetch the base64 YAML config secret (SNI creds + relay endpoint) and resolve the SNI certificate from Key Vault lazily
  * at IO time — avoiding the driver-init ordering race where the Fabric token context is not yet available. The `devcontainer` path defers to the local `az` identity and `uami` to the Fabric workspace identity; neither needs Key Vault coordinates. The token providers then mint cached Entra storage
  * tokens at IO time.
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

/** Driver plugin that resolves the per-account config and stamps ABFS OAuth onto the SparkContext's Hadoop Configuration.
  */
class AdlsOAuthTokenProviderDriverPlugin extends DriverPlugin with Logging {

  /** @inheritdoc
    */
  override def init(
      sc: SparkContext,
      ctx: PluginContext
  ): java.util.Map[String, String] = {
    val config = AdlsOAuthTokenProviderConf(ctx.conf)

    if (config.accounts.isEmpty) {
      logInfo("AdlsOAuthTokenProviderDriverPlugin: no ABFS OAuth accounts configured, skipping")
    } else {
      val hadoopConf = sc.hadoopConfiguration
      registerAbfsFileSystems(hadoopConf)
      config.accounts.foreach(account => configureAccount(hadoopConf, account, config))
    }

    new java.util.HashMap[String, String]
  }

  /** @inheritdoc
    */
  override def shutdown(): Unit = ()

  /** Registers the ABFS FileSystem implementations on the Hadoop Configuration.
    *
    * hadoop-azure is bundled into commonExecutor.jar, but the assembly's merge strategy keeps a single `META-INF/services/org.apache.hadoop.fs.FileSystem`, which drops hadoop-azure's `abfss` auto-registration. Stamping the impl classes explicitly makes `abfss://` resolve to our bundled
    * `AzureBlobFileSystem` without relying on the service file.
    *
    * @param hadoopConf
    *   The SparkContext's Hadoop Configuration.
    */
  private def registerAbfsFileSystems(hadoopConf: Configuration): Unit = {
    hadoopConf.set("fs.abfss.impl", "org.apache.hadoop.fs.azurebfs.SecureAzureBlobFileSystem")
    hadoopConf.set("fs.abfs.impl", "org.apache.hadoop.fs.azurebfs.AzureBlobFileSystem")
    hadoopConf.set("fs.AbstractFileSystem.abfss.impl", "org.apache.hadoop.fs.azurebfs.Abfss")
    hadoopConf.set("fs.AbstractFileSystem.abfs.impl", "org.apache.hadoop.fs.azurebfs.Abfs")
  }

  /** Stamps the ABFS OAuth Hadoop keys for a single account target.
    *
    * @param hadoopConf
    *   The SparkContext's Hadoop Configuration.
    * @param account
    *   The resolved account target.
    * @param config
    *   The resolved plugin config, carrying the shared Key Vault coordinates and runtime.
    */
  private def configureAccount(
      hadoopConf: Configuration,
      account: AdlsOAuthAccountConf,
      config: AdlsOAuthTokenProviderConf
  ): Unit = {
    val endpoint = account.endpoint
    hadoopConf.set(StorageOAuthHadoopKeys.authTypeKey(endpoint), "Custom")
    hadoopConf.set(
      StorageOAuthHadoopKeys.providerTypeKey(endpoint),
      StorageOAuthHadoopKeys.providerClassName(account.authType)
    )

    account.authType match {
      case SupportedProviderTypes.SpnSNICredentialProvider | SupportedProviderTypes.RelayCredentialProvider =>
        stampSecretBackedInputs(hadoopConf, account, config)
      case SupportedProviderTypes.DevcontainerCredentialProvider | SupportedProviderTypes.UamiCredentialProvider =>
        ()
    }

    logInfo(s"Configured ABFS OAuth (${account.authType}) for account '$endpoint'")
  }

  /** Stamps the Key Vault coordinates + runtime for an account whose credential is resolved from the base64 YAML config secret (`sni` / `relay`).
    *
    * The SNI certificate and the YAML secret itself are resolved from Key Vault lazily by the token provider at IO time, not here, so driver-plugin init never depends on the Fabric token context (`.trident-context`) being available — which it is not yet during `SparkContext` construction.
    *
    * @param hadoopConf
    *   The SparkContext's Hadoop Configuration.
    * @param account
    *   The secret-backed account target.
    * @param config
    *   The resolved plugin config, carrying the shared Key Vault coordinates and runtime.
    */
  private def stampSecretBackedInputs(
      hadoopConf: Configuration,
      account: AdlsOAuthAccountConf,
      config: AdlsOAuthTokenProviderConf
  ): Unit = {
    hadoopConf.set(StorageOAuthHadoopKeys.paramKey(account.endpoint, ProviderConfig.VAULT_URL), config.vaultUrl)
    hadoopConf.set(StorageOAuthHadoopKeys.paramKey(account.endpoint, ProviderConfig.CONFIG_SECRET_NAME), config.configSecretBase64Name)
    hadoopConf.set(StorageOAuthHadoopKeys.paramKey(account.endpoint, ProviderConfig.CLUSTER_TYPE), config.runtime.toString)
  }
}
