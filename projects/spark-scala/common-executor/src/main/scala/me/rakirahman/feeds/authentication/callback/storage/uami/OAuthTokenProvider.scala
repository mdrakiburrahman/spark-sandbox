package me.rakirahman.feeds.authentication.callback.storage.uami

import com.azure.core.credential.TokenRequestContext

import me.rakirahman.feeds.authentication.callback.storage.StorageEntraCallbackBase
import me.rakirahman.secret.entra.credential.providers.{CachedAccessTokenProvider, ProviderConfig, SupportedProviderTypes}
import me.rakirahman.secret.entra.credential.providers.secure.UamiCredentialProvider

/** ABFS OAuth token provider backed by the Fabric workspace User-Assigned Managed Identity (UAMI).
  *
  * Used for OneLake / Fabric storage accounts in the Fabric runtime, where the workspace identity already has the required storage access. The token is minted via `mssparkutils.credentials.getToken("storage")` lazily at IO time. Fabric-only: there is no local equivalent. Registered per account via
  * `fs.azure.account.oauth.provider.type.<account>`.
  */
class OAuthTokenProvider extends StorageEntraCallbackBase {

  /** @inheritdoc
    */
  override protected def requiredParamKeys: Array[String] =
    ProviderConfig.ProviderConstructorConfig(SupportedProviderTypes.UamiCredentialProvider)

  /** @inheritdoc
    */
  override def initTokenProvider(params: Map[String, String]): CachedAccessTokenProvider =
    CachedAccessTokenProvider(
      UamiCredentialProvider().getTokenCredential(),
      new TokenRequestContext()
    )
}
