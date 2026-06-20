package me.rakirahman.feeds.authentication.callback.storage.devcontainer

import com.azure.core.credential.TokenRequestContext

import me.rakirahman.feeds.authentication.callback.storage.StorageEntraCallbackBase
import me.rakirahman.secret.entra.credential.providers.{CachedAccessTokenProvider, ProviderConfig, SupportedProviderTypes}
import me.rakirahman.secret.entra.credential.providers.secure.DevcontainerCredentialProvider

/** ABFS OAuth token provider backed by the local Azure CLI (`az login`) identity.
  *
  * Used for OneLake / Fabric storage accounts, where the developer's `az` session already has the required Storage Blob Data access. Registered per account via `fs.azure.account.oauth.provider.type.<account>`.
  */
class OAuthTokenProvider extends StorageEntraCallbackBase {

  /** @inheritdoc
    */
  override protected def requiredParamKeys: Array[String] =
    ProviderConfig.ProviderConstructorConfig(SupportedProviderTypes.DevcontainerCredentialProvider)

  /** @inheritdoc
    */
  override def initTokenProvider(params: Map[String, String]): CachedAccessTokenProvider =
    CachedAccessTokenProvider(
      DevcontainerCredentialProvider().getTokenCredential(),
      new TokenRequestContext()
    )
}
