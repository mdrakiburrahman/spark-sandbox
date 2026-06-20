package me.rakirahman.spark.plugin.adlsoauthtokenproviderplugin.conf

import scala.util.matching.Regex

import me.rakirahman.runtime.SparkRuntime
import me.rakirahman.secret.entra.credential.providers.SupportedProviderTypes

import org.apache.spark.SparkConf
import org.apache.spark.internal.Logging

/** Resolved configuration for a single storage-account target.
  *
  * @param endpoint
  *   The storage account DFS endpoint (e.g. `ivmbenchdbrx.dfs.core.windows.net`).
  * @param authType
  *   The resolved auth type (`sni`, `devcontainer`, `relay`, or `uami`).
  */
case class AdlsOAuthAccountConf(
    endpoint: String,
    authType: SupportedProviderTypes.Types
)

/** Resolved configuration for the AdlsOAuthTokenProviderPlugin.
  *
  * The per-account block stays intentionally terse (`endpoint` + `authType`). The SNI credentials and the relay endpoint are declared once in the base64 YAML Key Vault secret named by [[configSecretBase64Name]] and resolved lazily at IO time.
  *
  * @param accounts
  *   The per-account ABFS OAuth targets.
  * @param vaultUrl
  *   The fully qualified Key Vault url holding the config secret + SNI certificate (shared).
  * @param configSecretBase64Name
  *   The Key Vault secret name holding the base64-encoded YAML (SNI creds + relay endpoint).
  * @param runtime
  *   The resolved Spark runtime.
  */
case class AdlsOAuthTokenProviderConf(
    accounts: Seq[AdlsOAuthAccountConf],
    vaultUrl: String,
    configSecretBase64Name: String,
    runtime: SparkRuntime.RuntimeTypes
)

/** Parses [[AdlsOAuthTokenProviderConf]] from a [[SparkConf]].
  *
  * Two global keys plus a terse, self-contained, indexed block per account:
  *
  * {{{
  *   spark.plugin.adlsoauth.vaultUrl               = https://myvault.vault.azure.net
  *   spark.plugin.adlsoauth.configSecretBase64Name = adlsoauth-base64
  *   spark.plugin.adlsoauth.account.0.endpoint     = ivmbenchdbrx.dfs.core.windows.net
  *   spark.plugin.adlsoauth.account.0.authType     = relay
  *   spark.plugin.adlsoauth.account.1.endpoint     = msit-onelake.dfs.fabric.microsoft.com
  *   spark.plugin.adlsoauth.account.1.authType     = uami
  * }}}
  *
  * `vaultUrl` and `configSecretBase64Name` are mandatory only when at least one account uses an auth type that reads the Key Vault config secret (`sni` or `relay`).
  */
object AdlsOAuthTokenProviderConf extends Logging {

  /** Common prefix for all plugin keys. */
  val KeyPrefix: String = "spark.plugin.adlsoauth"

  /** Common prefix for all plugin account keys. */
  val AccountKeyPrefix: String = s"$KeyPrefix.account"

  /** Spark conf key stamped by the cloud runtimes to identify themselves. */
  val ClusterTypeKey: String = "spark.cluster.type"

  /** Global Key Vault coordinates. */
  val VaultUrlKey: String = s"$KeyPrefix.vaultUrl"
  val ConfigSecretBase64NameKey: String = s"$KeyPrefix.configSecretBase64Name"

  /** Per-account key suffixes. */
  val EndpointSuffix: String = "endpoint"
  val AuthTypeSuffix: String = "authType"

  /** Auth types that resolve the SNI creds (and relay endpoint) from the Key Vault config secret. */
  val SecretBackedAuthTypes: Set[SupportedProviderTypes.Types] =
    Set(SupportedProviderTypes.SpnSNICredentialProvider, SupportedProviderTypes.RelayCredentialProvider)

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

    val needsSecret = accounts.exists(account => SecretBackedAuthTypes.contains(account.authType))
    val vaultUrl = readGlobal(conf, VaultUrlKey, mandatory = needsSecret)
    val configSecretBase64Name = readGlobal(conf, ConfigSecretBase64NameKey, mandatory = needsSecret)

    logInfo(s"resolved ${accounts.size} ABFS OAuth account target(s), runtime=$runtime")
    AdlsOAuthTokenProviderConf(accounts, vaultUrl, configSecretBase64Name, runtime)
  }

  private def parseAccount(conf: SparkConf, index: String): AdlsOAuthAccountConf = {
    val endpoint = required(conf, key(index, EndpointSuffix))
    val authType = SupportedProviderTypes.fromToken(required(conf, key(index, AuthTypeSuffix)))
    logInfo(s"resolved ABFS OAuth target: endpoint=$endpoint, authType=$authType")
    AdlsOAuthAccountConf(endpoint, authType)
  }

  private def key(index: String, suffix: String): String =
    s"$AccountKeyPrefix.$index.$suffix"

  private def required(conf: SparkConf, k: String): String = {
    val value = conf.getOption(k).map(_.trim).getOrElse("")
    if (value.isEmpty)
      throw new IllegalArgumentException(s"Missing mandatory plugin config key: $k")
    value
  }

  private def readGlobal(conf: SparkConf, k: String, mandatory: Boolean): String = {
    val value = conf.getOption(k).map(_.trim).getOrElse("")
    if (value.isEmpty && mandatory)
      throw new IllegalArgumentException(s"Missing mandatory plugin config key: $k")
    value
  }
}
