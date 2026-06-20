package me.rakirahman.feeds.authentication.callback.storage.relay

import com.azure.core.credential.TokenRequestContext

import me.rakirahman.feeds.authentication.callback.storage.SniBackedStorageEntraCallback
import me.rakirahman.secret.entra.credential.providers.{CachedAccessTokenProvider, SupportedProviderTypes}
import me.rakirahman.secret.extensions.TokenCredentialExtensions._

/** ABFS OAuth token provider backed by a SNI Service Principal brokered through an Azure Relay endpoint.
  *
  * The SNI credential authenticates to the relay (`https://relay.azure.net`), and the relay endpoint mints the storage token for an identity that has storage access. Used where the SNI Service Principal itself does not hold direct storage access but the relay-backed identity does.
  *
  * The plugin (driver) stamps only the Key Vault coordinates (`vaultUrl`, `configSecretBase64Name`) and the runtime; both the SNI creds and the relay endpoint are resolved from the base64 YAML config secret lazily at IO time. Registered per account via
  * `fs.azure.account.oauth.provider.type.<account>`.
  */
class OAuthTokenProvider extends SniBackedStorageEntraCallback {

  /** @inheritdoc
    */
  override protected def providerType: SupportedProviderTypes.Types =
    SupportedProviderTypes.RelayCredentialProvider

  /** @inheritdoc
    *
    * Builds the SNI credential, then wraps it with the relay endpoint so the storage token is brokered through the relay at IO time.
    */
  override def initTokenProvider(params: Map[String, String]): CachedAccessTokenProvider = {
    val secrets = secretManager(params)
    val conf = loadSecretConf(secrets, params)
    val sniCredential = buildSniCredential(secrets, conf.requireSni)
    CachedAccessTokenProvider(
      sniCredential.toRelayCredential(conf.requireRelay.endpoint),
      new TokenRequestContext()
    )
  }
}
