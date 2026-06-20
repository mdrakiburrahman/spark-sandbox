package me.rakirahman.feeds.authentication.callback.storage

import me.rakirahman.secret.entra.credential.providers.SupportedProviderTypes

/** Central definition of the ABFS Hadoop Configuration keys the plugin stamps and the storage OAuth token providers read back. Keeping them in one place prevents key drift between the producer (the driver plugin) and the consumer (the `CustomTokenProviderAdaptee`).
  */
object StorageOAuthHadoopKeys {

  /** FQCN of the SNI ABFS OAuth token provider. */
  val SniProviderClassName: String =
    "me.rakirahman.feeds.authentication.callback.storage.sni.OAuthTokenProvider"

  /** FQCN of the Devcontainer (Azure CLI) ABFS OAuth token provider. */
  val DevcontainerProviderClassName: String =
    "me.rakirahman.feeds.authentication.callback.storage.devcontainer.OAuthTokenProvider"

  /** FQCN of the Relay-brokered SNI ABFS OAuth token provider. */
  val RelayProviderClassName: String =
    "me.rakirahman.feeds.authentication.callback.storage.relay.OAuthTokenProvider"

  /** FQCN of the Fabric UAMI ABFS OAuth token provider. */
  val UamiProviderClassName: String =
    "me.rakirahman.feeds.authentication.callback.storage.uami.OAuthTokenProvider"

  /** Hadoop key selecting the ABFS auth scheme for an account (set to `Custom`).
    *
    * @param account
    *   The storage account (DFS endpoint).
    */
  def authTypeKey(account: String): String =
    s"fs.azure.account.auth.type.$account"

  /** Hadoop key naming the `CustomTokenProviderAdaptee` class for an account.
    *
    * @param account
    *   The storage account (DFS endpoint).
    */
  def providerTypeKey(account: String): String =
    s"fs.azure.account.oauth.provider.type.$account"

  /** Hadoop key for a per-account provider param.
    *
    * @param account
    *   The storage account (DFS endpoint).
    * @param name
    *   The param name (see `ProviderConfig`).
    */
  def paramKey(account: String, name: String): String =
    s"fs.azure.account.adlsoauth.$name.$account"

  /** Resolves the `CustomTokenProviderAdaptee` FQCN for an auth type.
    *
    * @param authType
    *   The resolved provider type.
    * @return
    *   The fully-qualified class name to register on `fs.azure.account.oauth.provider.type`.
    */
  def providerClassName(authType: SupportedProviderTypes.Types): String = authType match {
    case SupportedProviderTypes.SpnSNICredentialProvider       => SniProviderClassName
    case SupportedProviderTypes.DevcontainerCredentialProvider => DevcontainerProviderClassName
    case SupportedProviderTypes.RelayCredentialProvider        => RelayProviderClassName
    case SupportedProviderTypes.UamiCredentialProvider         => UamiProviderClassName
  }
}
