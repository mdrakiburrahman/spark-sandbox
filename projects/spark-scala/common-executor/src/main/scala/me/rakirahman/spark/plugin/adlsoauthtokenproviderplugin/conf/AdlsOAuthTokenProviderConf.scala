package me.rakirahman.spark.plugin.adlsoauthtokenproviderplugin.conf

import me.rakirahman.runtime.SparkRuntime

import org.apache.spark.SparkConf
import org.apache.spark.internal.Logging

/** Resolved configuration for the AdlsOAuthTokenProviderPlugin.
  *
  * @param vaultUrl
  *   The fully qualified Azure Key Vault url.
  * @param secretName
  *   The name of the secret to fetch.
  * @param outputPath
  *   The local path the secret value is written to.
  * @param linkedServiceName
  *   The Synapse linked service name; only used on the Synapse runtime.
  * @param runtime
  *   The resolved Spark runtime.
  */
case class AdlsOAuthTokenProviderConf(
    vaultUrl: String,
    secretName: String,
    outputPath: String,
    linkedServiceName: String,
    runtime: SparkRuntime.RuntimeTypes
)

/** Parses [[AdlsOAuthTokenProviderConf]] from a [[SparkConf]].
  */
object AdlsOAuthTokenProviderConf extends Logging {

  /** Spark conf key for the Key Vault url.
    */
  val VaultUrlKey: String = "spark.plugin.adlsoauth.vault.url"

  /** Spark conf key for the secret name to fetch.
    */
  val SecretNameKey: String = "spark.plugin.adlsoauth.secret.name"

  /** Spark conf key for the local output path.
    */
  val OutputPathKey: String = "spark.plugin.adlsoauth.output.path"

  /** Spark conf key for the Synapse linked service name.
    */
  val LinkedServiceNameKey: String =
    "spark.plugin.adlsoauth.synapse.linkedServiceName"

  /** Spark conf key stamped by the cloud runtimes to identify themselves.
    */
  val ClusterTypeKey: String = "spark.cluster.type"

  /** Default local output path for the fetched secret.
    */
  val DefaultOutputPath: String = "/tmp/secret.txt"

  /** Builds the config from a [[SparkConf]].
    *
    * @param conf
    *   The Spark conf to read plugin keys from.
    * @return
    *   The resolved [[AdlsOAuthTokenProviderConf]].
    */
  def apply(conf: SparkConf): AdlsOAuthTokenProviderConf = {
    val resolved = AdlsOAuthTokenProviderConf(
      vaultUrl = get(conf, VaultUrlKey, ""),
      secretName = get(conf, SecretNameKey, ""),
      outputPath = get(conf, OutputPathKey, DefaultOutputPath),
      linkedServiceName = get(conf, LinkedServiceNameKey, ""),
      runtime = SparkRuntime.fromClusterType(conf.get(ClusterTypeKey, ""))
    )
    logInfo(s"resolved runtime ${resolved.runtime} for $ClusterTypeKey")
    resolved
  }

  private def get(conf: SparkConf, key: String, default: String): String = {
    val value = conf.get(key, default)
    logInfo(s"using '$value' for $key")
    value
  }
}
