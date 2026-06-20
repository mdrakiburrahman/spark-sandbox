package me.rakirahman.secret.entra.credential.providers

// @formatter:off
/** Provider-specific configuration keys and validation.
  *
  * Mirrors the "callback payload" contract from the Event Hub flow: the plugin (driver)
  * resolves these params per storage account and threads them to the ABFS
  * `CustomTokenProviderAdaptee`, which reconstructs the credential from them.
  */
object ProviderConfig {

  /** Configuration keys threaded through the Hadoop Configuration per account. */
  val CLIENT_ID                            = "clientId"
  val TENANT_ID                            = "tenantId"
  val VAULT_URL                            = "vaultUrl"
  val CERT_NAME                            = "certName"
  val CLUSTER_TYPE                         = "clusterType"

  /** All param names a token provider may read back from the Hadoop Configuration. */
  val AllKeys: Seq[String] = Seq(TENANT_ID, CLIENT_ID, VAULT_URL, CERT_NAME, CLUSTER_TYPE)

  /** Mandatory constructor params per provider type.
    *
    *  DevcontainerCredentialProvider:
    *    - tenantId: carried for parity / multi-tenant token requests.
    *
    *  SpnSNICredentialProvider:
    *    - clientId, tenantId, vaultUrl, certName: the provider resolves the SNI cert from Key Vault at IO time and reconstructs the credential from these.
    */
  val ProviderConstructorConfig: Map[SupportedProviderTypes.Types, Array[String]] = Map(
    SupportedProviderTypes.DevcontainerCredentialProvider -> Array(TENANT_ID),
    SupportedProviderTypes.SpnSNICredentialProvider       -> Array(CLIENT_ID, TENANT_ID, VAULT_URL, CERT_NAME),
  )
}
// @formatter:on
