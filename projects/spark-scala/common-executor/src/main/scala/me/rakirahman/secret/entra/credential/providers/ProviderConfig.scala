package me.rakirahman.secret.entra.credential.providers

// @formatter:off
/** Provider-specific configuration keys and validation.
  *
  * These are the params the plugin (driver) stamps per storage account onto the Hadoop
  * Configuration and that the ABFS `CustomTokenProviderAdaptee` reads back at IO time.
  *
  * The SNI credential material (tenant/client ids, cert name) and the relay endpoint are
  * NOT stamped here — they live in the base64 YAML resolved from Key Vault at IO time
  * (see [[me.rakirahman.spark.plugin.adlsoauthtokenproviderplugin.conf.AdlsOAuthSecretConf]]).
  * Only the coordinates needed to fetch that secret are threaded through the Hadoop config.
  */
object ProviderConfig {

  /** Fully qualified Key Vault url holding both the config secret and the SNI certificate. */
  val VAULT_URL                            = "vaultUrl"

  /** Name of the base64-encoded YAML secret describing the SNI creds + relay endpoint. */
  val CONFIG_SECRET_NAME                   = "configSecretBase64Name"

  /** The resolved Spark runtime, used to pick the secret handler at IO time. */
  val CLUSTER_TYPE                         = "clusterType"

  /** All param names a token provider may read back from the Hadoop Configuration. */
  val AllKeys: Seq[String] = Seq(VAULT_URL, CONFIG_SECRET_NAME, CLUSTER_TYPE)

  /** Mandatory params per provider type.
    *
    *  SpnSNICredentialProvider / RelayCredentialProvider:
    *    - vaultUrl, configSecretBase64Name: used to fetch + parse the KV secret, then resolve the SNI cert.
    *
    *  DevcontainerCredentialProvider / UamiCredentialProvider:
    *    - none: the credential is derived from the ambient runtime identity.
    */
  val ProviderConstructorConfig: Map[SupportedProviderTypes.Types, Array[String]] = Map(
    SupportedProviderTypes.DevcontainerCredentialProvider -> Array.empty[String],
    SupportedProviderTypes.UamiCredentialProvider         -> Array.empty[String],
    SupportedProviderTypes.SpnSNICredentialProvider       -> Array(VAULT_URL, CONFIG_SECRET_NAME),
    SupportedProviderTypes.RelayCredentialProvider        -> Array(VAULT_URL, CONFIG_SECRET_NAME),
  )
}
// @formatter:on
