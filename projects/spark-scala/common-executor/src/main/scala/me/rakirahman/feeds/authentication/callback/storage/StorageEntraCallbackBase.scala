package me.rakirahman.feeds.authentication.callback.storage

import java.util.Date

import scala.collection.JavaConverters._

import me.rakirahman.secret.entra.credential.providers.CachedAccessTokenProvider
import me.rakirahman.secret.entra.credential.providers.ProviderConfig

import org.apache.hadoop.conf.Configuration
import org.apache.hadoop.fs.azurebfs.extensions.CustomTokenProviderAdaptee
import org.apache.spark.internal.Logging

/** Abstract base for the ABFS OAuth token providers.
  *
  * Hadoop's ABFS driver instantiates a concrete subclass by reflection (no-arg constructor) for a given storage account, calls [[initialize]] with the per-account params the plugin stamped onto the Hadoop [[Configuration]], and then calls [[getAccessToken]] / [[getExpiryTime]] on every storage
  * operation. The actual minting is delegated to a [[CachedAccessTokenProvider]] so the Entra token is cached and refreshed transparently.
  */
abstract class StorageEntraCallbackBase extends CustomTokenProviderAdaptee with Logging {

  /** The Entra scope used for ADLS Gen2 / OneLake storage access. */
  protected val StorageScope: String = "https://storage.azure.com/.default"

  @volatile private var accessTokenProvider: CachedAccessTokenProvider = _

  /** The mandatory param keys the concrete provider needs to reconstruct its credential. */
  protected def requiredParamKeys: Array[String]

  /** Builds the [[CachedAccessTokenProvider]] from the resolved per-account params.
    *
    * @param params
    *   The per-account params stamped onto the Hadoop Configuration by the plugin.
    * @return
    *   The cached access token provider used to mint storage tokens.
    */
  def initTokenProvider(params: Map[String, String]): CachedAccessTokenProvider

  /** @inheritdoc
    *
    * Reads the per-account params, validates them, and constructs the cached token provider with the storage scope already bound.
    */
  override def initialize(configuration: Configuration, accountName: String): Unit = {
    val params = readParams(configuration, accountName)
    validate(accountName, params)
    accessTokenProvider = initTokenProvider(params)
    accessTokenProvider.tokenRequestContext.setScopes(List(StorageScope).asJava)
    logInfo(s"Initialized ${getClass.getName} for account '$accountName'")
  }

  /** @inheritdoc
    */
  override def getAccessToken(): String =
    accessTokenProvider.getAccessToken.getToken

  /** @inheritdoc
    */
  override def getExpiryTime(): Date =
    Date.from(accessTokenProvider.getAccessToken.getExpiresAt.toInstant)

  /** Builds the per-account Hadoop Configuration key for a given param.
    *
    * @param account
    *   The storage account (DFS endpoint).
    * @param name
    *   The param name (see [[ProviderConfig]]).
    * @return
    *   The namespaced Hadoop Configuration key.
    */
  protected def paramKey(account: String, name: String): String =
    StorageOAuthHadoopKeys.paramKey(account, name)

  /** Reads the known params for an account from the Hadoop Configuration.
    *
    * @param configuration
    *   The ABFS Hadoop Configuration.
    * @param account
    *   The storage account (DFS endpoint).
    * @return
    *   A map of the present params, keyed by [[ProviderConfig]] name.
    */
  private def readParams(configuration: Configuration, account: String): Map[String, String] =
    Seq(
      ProviderConfig.TENANT_ID,
      ProviderConfig.CLIENT_ID,
      ProviderConfig.CLIENT_CERT,
      ProviderConfig.CLIENT_CERT_RANDOM_RUNTIME_PASSWORD
    ).flatMap(name => Option(configuration.get(paramKey(account, name))).map(name -> _)).toMap

  /** Validates that all mandatory params are present.
    *
    * @param account
    *   The storage account (DFS endpoint).
    * @param params
    *   The resolved params.
    * @throws IllegalArgumentException
    *   if a mandatory param is missing.
    */
  private def validate(account: String, params: Map[String, String]): Unit =
    requiredParamKeys.foreach { key =>
      if (!params.contains(key))
        throw new IllegalArgumentException(
          s"Missing mandatory param '$key' for account '$account' in ${getClass.getName}"
        )
    }
}
