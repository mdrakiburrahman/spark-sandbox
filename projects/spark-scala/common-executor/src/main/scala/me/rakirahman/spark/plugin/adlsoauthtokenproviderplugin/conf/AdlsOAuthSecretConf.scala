package me.rakirahman.spark.plugin.adlsoauthtokenproviderplugin.conf

import scala.collection.JavaConverters._

import org.yaml.snakeyaml.Yaml

/** The SNI Service Principal credentials carried by the Key Vault config secret.
  *
  * @param tenantId
  *   The Entra tenant id.
  * @param clientId
  *   The Service Principal client id.
  * @param certName
  *   The Key Vault certificate/secret name holding the SNI certificate.
  */
case class SniSecretConf(tenantId: String, clientId: String, certName: String)

/** The Azure Relay coordinates carried by the Key Vault config secret.
  *
  * @param endpoint
  *   The relay endpoint URL that brokers the storage token. Kept out of committed config on purpose.
  */
case class RelaySecretConf(endpoint: String)

/** The decoded contents of the `spark.plugin.adlsoauth.configSecretBase64Name` Key Vault secret.
  *
  * Shared by all `sni` / `relay` accounts so the SNI creds and relay endpoint are declared once rather than repeated per storage account.
  *
  * @param sni
  *   The SNI credentials, present when any account uses `sni` or `relay`.
  * @param relay
  *   The relay coordinates, present when any account uses `relay`.
  */
case class AdlsOAuthSecretConf(sni: Option[SniSecretConf], relay: Option[RelaySecretConf]) {

  /** The SNI credentials, or a descriptive failure if the `sni` block is absent. */
  def requireSni: SniSecretConf =
    sni.getOrElse(throw new IllegalArgumentException("Missing 'sni' block in adlsoauth config secret"))

  /** The relay coordinates, or a descriptive failure if the `relay` block is absent. */
  def requireRelay: RelaySecretConf =
    relay.getOrElse(throw new IllegalArgumentException("Missing 'relay' block in adlsoauth config secret"))
}

/** Parses [[AdlsOAuthSecretConf]] from the base64-encoded YAML stored in Key Vault.
  *
  * Expected YAML shape:
  *
  * {{{
  *   sni:
  *     tenantId: <guid>
  *     clientId: <guid>
  *     certName: <kv-cert-secret-name>
  *   relay:
  *     endpoint: <relay-endpoint-url>
  * }}}
  */
object AdlsOAuthSecretConf {

  val SniKey: String = "sni"
  val RelayKey: String = "relay"
  val TenantIdKey: String = "tenantId"
  val ClientIdKey: String = "clientId"
  val CertNameKey: String = "certName"
  val EndpointKey: String = "endpoint"

  /** Decodes a base64-encoded YAML payload and parses it.
    *
    * @param base64Yaml
    *   The base64-encoded YAML payload (the raw Key Vault secret value).
    * @return
    *   The parsed [[AdlsOAuthSecretConf]].
    */
  def fromBase64(base64Yaml: String): AdlsOAuthSecretConf = {
    val trimmed = Option(base64Yaml).map(_.trim).getOrElse("")
    if (trimmed.isEmpty)
      throw new IllegalArgumentException("adlsoauth config secret is empty")
    fromYaml(new String(java.util.Base64.getDecoder.decode(trimmed), "UTF-8"))
  }

  /** Parses a decoded YAML payload.
    *
    * @param yaml
    *   The decoded YAML payload.
    * @return
    *   The parsed [[AdlsOAuthSecretConf]].
    */
  def fromYaml(yaml: String): AdlsOAuthSecretConf = {
    val root = Option(new Yaml().load[Any](yaml)) match {
      case Some(m: java.util.Map[_, _]) => m.asInstanceOf[java.util.Map[String, Any]].asScala.toMap
      case _                            => throw new IllegalArgumentException("adlsoauth config secret is not a YAML mapping")
    }

    val sni = section(root, SniKey).map { fields =>
      SniSecretConf(
        tenantId = requiredField(fields, SniKey, TenantIdKey),
        clientId = requiredField(fields, SniKey, ClientIdKey),
        certName = requiredField(fields, SniKey, CertNameKey)
      )
    }

    val relay = section(root, RelayKey).map { fields =>
      RelaySecretConf(endpoint = requiredField(fields, RelayKey, EndpointKey))
    }

    AdlsOAuthSecretConf(sni, relay)
  }

  private def section(root: Map[String, Any], key: String): Option[Map[String, Any]] =
    root.get(key) match {
      case Some(m: java.util.Map[_, _]) => Some(m.asInstanceOf[java.util.Map[String, Any]].asScala.toMap)
      case Some(_)                      => throw new IllegalArgumentException(s"adlsoauth config secret '$key' must be a mapping")
      case None                         => None
    }

  private def requiredField(fields: Map[String, Any], sectionName: String, field: String): String =
    fields
      .get(field)
      .map(_.toString.trim)
      .filter(_.nonEmpty)
      .getOrElse(
        throw new IllegalArgumentException(s"Missing mandatory field '$sectionName.$field' in adlsoauth config secret")
      )
}
