package me.rakirahman.feeds.authentication.callback.storage.sni

import com.azure.core.credential.TokenRequestContext

import me.rakirahman.feeds.authentication.callback.storage.SniBackedStorageEntraCallback
import me.rakirahman.secret.entra.credential.providers.{CachedAccessTokenProvider, SupportedProviderTypes}

/** ABFS OAuth token provider backed by a Subject Name and Issuer (SNI) Service Principal.
  *
  * Used for ADLS Gen2 storage accounts. The plugin (driver) stamps only the Key Vault coordinates (`vaultUrl`, `configSecretBase64Name`) and the runtime; this provider resolves the shared SNI creds from the base64 YAML config secret and the SNI certificate from Key Vault lazily at IO time, then
  * builds the `ClientCertificateCredential`. Registered per account via `fs.azure.account.oauth.provider.type.<account>`.
  */
class OAuthTokenProvider extends SniBackedStorageEntraCallback {

  /** @inheritdoc
    */
  override protected def providerType: SupportedProviderTypes.Types =
    SupportedProviderTypes.SpnSNICredentialProvider

  /** @inheritdoc
    *
    * Fetches + parses the config secret, resolves the SNI cert, and mints storage tokens directly from the SNI credential. Deferring this to IO time avoids the driver-plugin init ordering race where the Fabric token context is not yet available.
    */
  override def initTokenProvider(params: Map[String, String]): CachedAccessTokenProvider = {
    val secrets = secretManager(params)
    val conf = loadSecretConf(secrets, params)
    CachedAccessTokenProvider(
      buildSniCredential(secrets, conf.requireSni),
      new TokenRequestContext()
    )
  }
}
