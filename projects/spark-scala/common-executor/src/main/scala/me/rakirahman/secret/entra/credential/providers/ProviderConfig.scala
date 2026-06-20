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
  val CLIENT_CERT                          = "clientCert"
  val CLIENT_CERT_RANDOM_RUNTIME_PASSWORD  = "clientCertRandomRuntimePassword"
  val CLIENT_ID                            = "clientId"
  val TENANT_ID                            = "tenantId"

  /** Mandatory constructor params per provider type.
    *
    *  DevcontainerCredentialProvider:
    *    - tenantId: carried for parity / multi-tenant token requests.
    *
    *  SpnSNICredentialProvider:
    *    - clientId, clientCert, clientCertRandomRuntimePassword, tenantId: authentication is initiated via these.
    */
  val ProviderConstructorConfig: Map[SupportedProviderTypes.Types, Array[String]] = Map(
    SupportedProviderTypes.DevcontainerCredentialProvider -> Array(TENANT_ID),
    SupportedProviderTypes.SpnSNICredentialProvider       -> Array(CLIENT_ID, CLIENT_CERT, CLIENT_CERT_RANDOM_RUNTIME_PASSWORD, TENANT_ID),
  )
}
// @formatter:on
