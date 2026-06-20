package me.rakirahman.feeds.authentication.callback.storage.sni

import com.azure.core.credential.TokenRequestContext
import com.azure.core.http.netty.NettyAsyncHttpClientBuilder

import me.rakirahman.feeds.authentication.callback.storage.StorageEntraCallbackBase
import me.rakirahman.secret.certificates.OpenSSLCertificateManager
import me.rakirahman.secret.entra.credential.providers.{CachedAccessTokenProvider, ProviderConfig, SupportedProviderTypes}
import me.rakirahman.secret.entra.credential.providers.secure.SpnSNICredentialProvider

/** ABFS OAuth token provider backed by a Subject Name and Issuer (SNI) Service Principal.
  *
  * Used for ADLS Gen2 storage accounts. The plugin (driver) resolves the SNI cert from Key Vault, converts it to a password-protected PFX, and stamps the PFX payload + password + client/tenant ids onto the Hadoop Configuration; this provider reconstructs the `ClientCertificateCredential` from those
  * params. Registered per account via `fs.azure.account.oauth.provider.type.<account>`.
  */
class OAuthTokenProvider extends StorageEntraCallbackBase {

  /** @inheritdoc
    */
  override protected def requiredParamKeys: Array[String] =
    ProviderConfig.ProviderConstructorConfig(SupportedProviderTypes.SpnSNICredentialProvider)

  /** @inheritdoc
    */
  override def initTokenProvider(params: Map[String, String]): CachedAccessTokenProvider =
    CachedAccessTokenProvider(
      SpnSNICredentialProvider(
        httpClient = new NettyAsyncHttpClientBuilder().build(),
        certManager = OpenSSLCertificateManager(),
        certPfxPayload = params(ProviderConfig.CLIENT_CERT),
        certPfxPassword = params(ProviderConfig.CLIENT_CERT_RANDOM_RUNTIME_PASSWORD)
      ).getTokenCredential(
        tenantId = params(ProviderConfig.TENANT_ID),
        clientId = params(ProviderConfig.CLIENT_ID)
      ),
      new TokenRequestContext()
    )
}
