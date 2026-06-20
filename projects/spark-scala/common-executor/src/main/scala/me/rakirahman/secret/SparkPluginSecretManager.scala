package me.rakirahman.secret

import com.azure.core.http.netty.NettyAsyncHttpClientBuilder
import me.rakirahman.runtime.SparkRuntime
import me.rakirahman.secret.entra.credential.providers.secure.DevcontainerCredentialProvider
import me.rakirahman.secret.handlers.SecretHandler
import me.rakirahman.secret.handlers.fabric.FabricSecretHandler
import me.rakirahman.secret.handlers.keyvault.KeyVaultSecretHandler
import me.rakirahman.secret.handlers.synapse.SynapseSecretHandler

/** Manages the [[SecretHandler]] for the given Spark runtime.
  *
  * This is the plugin-facing variant of the secret manager: it carries no dependency on an environment configuration and is driven purely by the resolved [[SparkRuntime]] plus the Key Vault coordinates supplied through Spark conf.
  *
  * @param runtime
  *   The resolved Spark runtime.
  * @param vaultUrl
  *   The fully qualified Azure Key Vault url (e.g. `https://myvault.vault.azure.net`).
  * @param linkedServiceName
  *   The Synapse linked service name; only used on the Synapse runtime.
  */
class SparkPluginSecretManager(
    runtime: SparkRuntime.RuntimeTypes,
    vaultUrl: String,
    linkedServiceName: String = ""
) {

  /** The secret handler selected for the current runtime.
    */
  lazy val handler: SecretHandler = runtime match {
    case SparkRuntime.Devcontainer => devcontainer
    case SparkRuntime.Synapse      => synapse
    case SparkRuntime.Fabric       => fabric
  }

  /** Retrieves the secret value associated with the given key.
    *
    * @param key
    *   The key of the secret.
    * @return
    *   The secret value.
    */
  def getSecret(key: String): String = handler.getSecret(key)

  /** Handles secrets locally by reaching the real Key Vault with the developer's Azure CLI login.
    */
  private lazy val devcontainer: KeyVaultSecretHandler =
    KeyVaultSecretHandler(
      new NettyAsyncHttpClientBuilder().build(),
      vaultUrl,
      DevcontainerCredentialProvider().getTokenCredential()
    )

  /** Handles secrets for Synapse runs.
    */
  private lazy val synapse: SynapseSecretHandler =
    SynapseSecretHandler(keyVaultName, linkedServiceName)

  /** Handles secrets for Fabric runs.
    */
  private lazy val fabric: FabricSecretHandler =
    FabricSecretHandler(keyVaultName)

  /** The short Key Vault name derived from [[vaultUrl]], used by the mssparkutils-backed handlers.
    */
  private lazy val keyVaultName: String =
    vaultUrl
      .stripPrefix("https://")
      .stripPrefix("http://")
      .stripSuffix("/")
      .stripSuffix(".vault.azure.net")
}

/** Companion object for [[SparkPluginSecretManager]].
  */
object SparkPluginSecretManager {

  /** Constructor.
    *
    * @param runtime
    *   The resolved Spark runtime.
    * @param vaultUrl
    *   The fully qualified Azure Key Vault url.
    * @param linkedServiceName
    *   The Synapse linked service name; only used on the Synapse runtime.
    * @return
    *   A new instance of SparkPluginSecretManager.
    */
  def apply(
      runtime: SparkRuntime.RuntimeTypes,
      vaultUrl: String,
      linkedServiceName: String = ""
  ): SparkPluginSecretManager =
    new SparkPluginSecretManager(runtime, vaultUrl, linkedServiceName)
}
