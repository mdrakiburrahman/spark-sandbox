package me.rakirahman.secret.entra.credential.providers

/** Enumeration defining the types of credential providers supported by the ABFS OAuth token providers.
  */
object SupportedProviderTypes extends Enumeration {
  type Types = Value

  /** Local Azure CLI (`az login`) identity — used for OneLake / Fabric storage. */
  val DevcontainerCredentialProvider = Value("devcontainer")

  /** Subject Name and Issuer (SNI) Service Principal — used for ADLS Gen2 storage. */
  val SpnSNICredentialProvider = Value("sni")

  /** SNI Service Principal brokered through an Azure Relay endpoint that mints the storage token. */
  val RelayCredentialProvider = Value("relay")

  /** Fabric User-Assigned Managed Identity via `mssparkutils.credentials.getToken`. */
  val UamiCredentialProvider = Value("uami")

  /** Resolves a [[Types]] from its lowercase config token.
    *
    * @param token
    *   The configured auth-type token (e.g. `sni`, `devcontainer`).
    * @return
    *   The resolved [[Types]].
    * @throws IllegalArgumentException
    *   if the token does not map to a supported provider type.
    */
  def fromToken(token: String): Types =
    try {
      withName(Option(token).map(_.trim.toLowerCase).getOrElse(""))
    } catch {
      case _: NoSuchElementException =>
        throw new IllegalArgumentException(
          s"Unsupported auth type: '$token'. Supported: ${values.map(_.toString).mkString(", ")}"
        )
    }
}
