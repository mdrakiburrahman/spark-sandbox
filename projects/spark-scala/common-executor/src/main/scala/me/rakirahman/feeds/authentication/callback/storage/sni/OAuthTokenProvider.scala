package me.rakirahman.feeds.authentication.callback.storage.sni

import com.azure.core.credential.TokenRequestContext
import com.azure.core.http.netty.NettyAsyncHttpClientBuilder

import me.rakirahman.feeds.authentication.callback.storage.StorageEntraCallbackBase
import me.rakirahman.runtime.SparkRuntime
import me.rakirahman.secret.SparkPluginSecretManager
import me.rakirahman.secret.certificates.OpenSSLCertificateManager
import me.rakirahman.secret.entra.credential.providers.{CachedAccessTokenProvider, ProviderConfig, SupportedProviderTypes}
import me.rakirahman.secret.entra.credential.providers.secure.SpnSNICredentialProvider

/** ABFS OAuth token provider backed by a Subject Name and Issuer (SNI) Service Principal.
  *
  * Used for ADLS Gen2 storage accounts. The plugin (driver) stamps the SNI *inputs* (client/tenant ids, Key Vault url, cert name, runtime) onto the Hadoop Configuration; this provider resolves the SNI cert from Key Vault and converts it to a password-protected PFX lazily at IO time — when the
  * Fabric / Synapse token context is available — then reconstructs the `ClientCertificateCredential`. Registered per account via `fs.azure.account.oauth.provider.type.<account>`.
  */
class OAuthTokenProvider extends StorageEntraCallbackBase {

  /** @inheritdoc
    */
  override protected def requiredParamKeys: Array[String] =
    ProviderConfig.ProviderConstructorConfig(SupportedProviderTypes.SpnSNICredentialProvider)

  /** @inheritdoc
    *
    * Resolves the SNI certificate from Key Vault (via the runtime-appropriate secret handler) and converts it to a password-protected PFX before building the credential. Deferring this to IO time avoids the driver-plugin init ordering race where the Fabric token context is not yet available.
    */
  override def initTokenProvider(params: Map[String, String]): CachedAccessTokenProvider = {
    val runtime = SparkRuntime.fromName(params.getOrElse(ProviderConfig.CLUSTER_TYPE, ""))
    val certManager = OpenSSLCertificateManager()
    val secretManager = SparkPluginSecretManager(runtime = runtime, vaultUrl = params(ProviderConfig.VAULT_URL))

    val certBase64 = secretManager.getSecret(params(ProviderConfig.CERT_NAME))
    val pfxPassword = certManager.generatePfxPassword()
    val pfxPayload = certManager.convertToPfxWithPassword(certBase64, pfxPassword)

    CachedAccessTokenProvider(
      SpnSNICredentialProvider(
        httpClient = new NettyAsyncHttpClientBuilder().build(),
        certManager = certManager,
        certPfxPayload = pfxPayload,
        certPfxPassword = pfxPassword
      ).getTokenCredential(
        tenantId = params(ProviderConfig.TENANT_ID),
        clientId = params(ProviderConfig.CLIENT_ID)
      ),
      new TokenRequestContext()
    )
  }
}
