package me.rakirahman.spark.plugin.adlsoauthtokenproviderplugin.conf

import scala.util.matching.Regex

import me.rakirahman.runtime.SparkRuntime
import me.rakirahman.secret.entra.credential.providers.SupportedProviderTypes

import org.apache.spark.SparkConf
import org.apache.spark.internal.Logging

/** Resolved configuration for a single storage-account target.
  *
  * @param endpoint
  *   The storage account DFS endpoint (e.g. `fabricdevmdrrahman.dfs.core.windows.net`).
  * @param authType
  *   The resolved auth type (`sni` or `devcontainer`).
  * @param tenantId
  *   The Entra tenant id.
  * @param clientId
  *   The Service Principal client id (SNI only).
  * @param vaultUrl
  *   The fully qualified Key Vault url holding the SNI certificate (SNI only).
  * @param certName
  *   The Key Vault certificate/secret name (SNI only).
  */
case class AdlsOAuthAccountConf(
    endpoint: String,
    authType: SupportedProviderTypes.Types,
    tenantId: String,
    clientId: String,
    vaultUrl: String,
    certName: String
)

/** Resolved configuration for the AdlsOAuthTokenProviderPlugin.
  *
  * @param accounts
  *   The per-account ABFS OAuth targets.
  * @param runtime
  *   The resolved Spark runtime.
  */
case class AdlsOAuthTokenProviderConf(
    accounts: Seq[AdlsOAuthAccountConf],
    runtime: SparkRuntime.RuntimeTypes
)

/** Parses [[AdlsOAuthTokenProviderConf]] from a [[SparkConf]].
  *
  * Each storage account is configured as a self-contained, indexed block so that the modular injection in `spark-defaults.conf` stays unambiguous (the DFS endpoint itself is a value, never part of a Spark conf key):
  *
  * {{{
  *   spark.plugin.adlsoauth.account.0.endpoint = fabricdevmdrrahman.dfs.core.windows.net
  *   spark.plugin.adlsoauth.account.0.authType = sni
  *   spark.plugin.adlsoauth.account.0.tenantId = ...
  *   spark.plugin.adlsoauth.account.0.clientId = ...
  *   spark.plugin.adlsoauth.account.0.vaultUrl = https://vault.vault.azure.net
  *   spark.plugin.adlsoauth.account.0.certName = my-sni-cert
  *   spark.plugin.adlsoauth.account.1.endpoint = msit-onelake.dfs.fabric.microsoft.com
  *   spark.plugin.adlsoauth.account.1.authType = devcontainer
  *   spark.plugin.adlsoauth.account.1.tenantId = ...
  * }}}
  */
object AdlsOAuthTokenProviderConf extends Logging {

  /** Common prefix for all plugin account keys. */
  val AccountKeyPrefix: String = "spark.plugin.adlsoauth.account"

  /** Spark conf key stamped by the cloud runtimes to identify themselves. */
  val ClusterTypeKey: String = "spark.cluster.type"

  /** Per-account key suffixes. */
  val EndpointSuffix: String = "endpoint"
  val AuthTypeSuffix: String = "authType"
  val TenantIdSuffix: String = "tenantId"
  val ClientIdSuffix: String = "clientId"
  val VaultUrlSuffix: String = "vaultUrl"
  val CertNameSuffix: String = "certName"

  private val EndpointKeyPattern: Regex =
    s"""^${Regex.quote(AccountKeyPrefix)}\\.([^.]+)\\.$EndpointSuffix$$""".r

  /** Builds the config from a [[SparkConf]].
    *
    * @param conf
    *   The Spark conf to read plugin keys from.
    * @return
    *   The resolved [[AdlsOAuthTokenProviderConf]].
    */
  def apply(conf: SparkConf): AdlsOAuthTokenProviderConf = {
    val indices = conf.getAll.collect { case (EndpointKeyPattern(index), _) => index }.distinct.sorted

    val accounts = indices.map(parseAccount(conf, _))
    val runtime = SparkRuntime.fromClusterType(conf.get(ClusterTypeKey, ""))

    logInfo(s"resolved ${accounts.size} ABFS OAuth account target(s), runtime=$runtime")
    AdlsOAuthTokenProviderConf(accounts, runtime)
  }

  private def parseAccount(conf: SparkConf, index: String): AdlsOAuthAccountConf = {
    val endpoint = required(conf, index, EndpointSuffix)
    val authType = SupportedProviderTypes.fromToken(required(conf, index, AuthTypeSuffix))
    val tenantId = required(conf, index, TenantIdSuffix)

    val account = authType match {
      case SupportedProviderTypes.SpnSNICredentialProvider =>
        AdlsOAuthAccountConf(
          endpoint = endpoint,
          authType = authType,
          tenantId = tenantId,
          clientId = required(conf, index, ClientIdSuffix),
          vaultUrl = required(conf, index, VaultUrlSuffix),
          certName = required(conf, index, CertNameSuffix)
        )
      case SupportedProviderTypes.DevcontainerCredentialProvider =>
        AdlsOAuthAccountConf(
          endpoint = endpoint,
          authType = authType,
          tenantId = tenantId,
          clientId = "",
          vaultUrl = "",
          certName = ""
        )
    }
    logInfo(s"resolved ABFS OAuth target: endpoint=${account.endpoint}, authType=${account.authType}")
    account
  }

  private def key(index: String, suffix: String): String =
    s"$AccountKeyPrefix.$index.$suffix"

  private def required(conf: SparkConf, index: String, suffix: String): String = {
    val k = key(index, suffix)
    val value = conf.getOption(k).map(_.trim).getOrElse("")
    if (value.isEmpty)
      throw new IllegalArgumentException(s"Missing mandatory plugin config key: $k")
    value
  }
}
