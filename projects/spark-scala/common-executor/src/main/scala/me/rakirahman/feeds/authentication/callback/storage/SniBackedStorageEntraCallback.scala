package me.rakirahman.feeds.authentication.callback.storage

import com.azure.core.credential.TokenCredential
import com.azure.core.http.netty.NettyAsyncHttpClientBuilder

import me.rakirahman.runtime.SparkRuntime
import me.rakirahman.secret.SparkPluginSecretManager
import me.rakirahman.secret.certificates.OpenSSLCertificateManager
import me.rakirahman.secret.entra.credential.providers.{ProviderConfig, SupportedProviderTypes}
import me.rakirahman.secret.entra.credential.providers.secure.SpnSNICredentialProvider
import me.rakirahman.spark.plugin.adlsoauthtokenproviderplugin.conf.{AdlsOAuthSecretConf, SniSecretConf}

/** Shared base for the ABFS OAuth token providers whose credential is rooted in the SNI Service Principal (the `sni` and `relay` providers).
  *
  * Both fetch the base64 YAML config secret from Key Vault at IO time (deferring the secret call past driver-plugin init, where the Fabric token context is not yet available), parse the shared SNI creds + relay endpoint, and resolve the SNI certificate from the same Key Vault. The `relay` provider
  * then wraps the resulting credential to broker the storage token through the relay endpoint.
  */
abstract class SniBackedStorageEntraCallback extends StorageEntraCallbackBase {

  /** The provider type, used to resolve the mandatory param keys. */
  protected def providerType: SupportedProviderTypes.Types

  /** @inheritdoc
    */
  override protected def requiredParamKeys: Array[String] =
    ProviderConfig.ProviderConstructorConfig(providerType)

  /** Builds the runtime-appropriate secret manager bound to the configured Key Vault.
    *
    * @param params
    *   The per-account params stamped onto the Hadoop Configuration by the plugin.
    * @return
    *   The secret manager used to fetch the config secret and the SNI certificate.
    */
  protected def secretManager(params: Map[String, String]): SparkPluginSecretManager = {
    val runtime = SparkRuntime.fromName(params.getOrElse(ProviderConfig.CLUSTER_TYPE, ""))
    SparkPluginSecretManager(runtime = runtime, vaultUrl = params(ProviderConfig.VAULT_URL))
  }

  /** Fetches and parses the base64 YAML config secret from Key Vault.
    *
    * @param secretManager
    *   The secret manager bound to the configured Key Vault.
    * @param params
    *   The per-account params stamped onto the Hadoop Configuration by the plugin.
    * @return
    *   The parsed config secret (SNI creds + relay endpoint).
    */
  protected def loadSecretConf(
      secretManager: SparkPluginSecretManager,
      params: Map[String, String]
  ): AdlsOAuthSecretConf =
    AdlsOAuthSecretConf.fromBase64(secretManager.getSecret(params(ProviderConfig.CONFIG_SECRET_NAME)))

  /** Resolves the SNI certificate from Key Vault and builds the `ClientCertificateCredential`.
    *
    * @param secretManager
    *   The secret manager bound to the configured Key Vault.
    * @param sni
    *   The SNI credentials parsed from the config secret.
    * @return
    *   The SNI-backed token credential.
    */
  protected def buildSniCredential(
      secretManager: SparkPluginSecretManager,
      sni: SniSecretConf
  ): TokenCredential = {
    val certManager = OpenSSLCertificateManager()
    val certBase64 = secretManager.getSecret(sni.certName)
    val pfxPassword = certManager.generatePfxPassword()
    val pfxPayload = certManager.convertToPfxWithPassword(certBase64, pfxPassword)

    SpnSNICredentialProvider(
      httpClient = new NettyAsyncHttpClientBuilder().build(),
      certManager = certManager,
      certPfxPayload = pfxPayload,
      certPfxPassword = pfxPassword
    ).getTokenCredential(
      tenantId = sni.tenantId,
      clientId = sni.clientId
    )
  }
}
