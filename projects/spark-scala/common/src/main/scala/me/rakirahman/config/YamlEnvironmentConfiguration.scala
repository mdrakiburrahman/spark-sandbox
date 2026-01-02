package me.rakirahman.config

import me.rakirahman.parser.yaml.YamlParser

import mssparkutils.notebook

import java.io.{File, FileInputStream}
import scala.collection.JavaConverters._
import scala.io.Source
import scala.sys.process._

import org.apache.spark.sql.SparkSession

/** Represents an environment configuration passed in as YAML.
  */
trait YamlEnvironmentConfiguration extends EnvironmentConfiguration {

  /** The driver name.
    */
  def driverName: String

  /** The name of the YAML file containing the configuration.
    */
  def fileName: String

  /** The raw, untransformed configuration content.
    */
  lazy val RawConfig: String = getConfigFromFilesystem(fileName)

  /** The transformed configuration content.
    */
  lazy val RuntimeConfig: String = replacePlaceholders(RawConfig)

  /** The configuration instance.
    */
  lazy val instance: java.util.Map[String, Any] = config()

  /** @inheritdoc
    */
  override def config(): java.util.Map[String, Any] =
    YamlParser.loadMap(RuntimeConfig)

  /** @inheritdoc
    */
  override val LocalSpark: Boolean = instance
    .get("spark")
    .asInstanceOf[java.util.Map[String, Any]]
    .get("local")
    .asInstanceOf[Boolean]

  /** @inheritdoc
    */
  override val DebugEnabled: Boolean = instance
    .get("spark")
    .asInstanceOf[java.util.Map[String, Any]]
    .get("debug")
    .asInstanceOf[Boolean]

  /** @inheritdoc
    */
  override val SparkJettyUIEnabled: Boolean = instance
    .get("spark")
    .asInstanceOf[java.util.Map[String, Any]]
    .get("ui")
    .asInstanceOf[Boolean]

  /** @inheritdoc
    */
  override val SparkOffHeapMemoryEnabled: Boolean = instance
    .get("spark")
    .asInstanceOf[java.util.Map[String, Any]]
    .get("offHeapEnabled")
    .asInstanceOf[Boolean]

  /** @inheritdoc
    */
  override val SparkDriverCores: Integer = instance
    .get("spark")
    .asInstanceOf[java.util.Map[String, Any]]
    .get("driverCore")
    .asInstanceOf[Integer]

  /** @inheritdoc
    */
  override val SparkDriverMemory: String = instance
    .get("spark")
    .asInstanceOf[java.util.Map[String, Any]]
    .get("driverMemory")
    .asInstanceOf[String]

  /** @inheritdoc
    */
  override val SparkExecutorCores: Integer = instance
    .get("spark")
    .asInstanceOf[java.util.Map[String, Any]]
    .get("executorCore")
    .asInstanceOf[Integer]

  /** @inheritdoc
    */
  override val SparkShufflePartitions: Integer = instance
    .get("spark")
    .asInstanceOf[java.util.Map[String, Any]]
    .get("shufflePartitions")
    .asInstanceOf[Integer]

  /** @inheritdoc
    */
  override val StateStoreProviderClass: String = instance
    .get("spark")
    .asInstanceOf[java.util.Map[String, Any]]
    .get("state")
    .asInstanceOf[java.util.Map[String, Any]]
    .get("storeProviderClass")
    .asInstanceOf[String]

  /** @inheritdoc
    */
  override val SparkExecutorMemory: String = instance
    .get("spark")
    .asInstanceOf[java.util.Map[String, Any]]
    .get("executorMemory")
    .asInstanceOf[String]

  /** @inheritdoc
    */
  override val SparkOffHeapMemory: String = instance
    .get("spark")
    .asInstanceOf[java.util.Map[String, Any]]
    .get("offHeapMemory")
    .asInstanceOf[String]

  /** @inheritdoc
    */
  override val WarehouseRootPath: String = instance
    .get("spark")
    .asInstanceOf[java.util.Map[String, Any]]
    .get("warehouseRootPath")
    .asInstanceOf[String]

  /** @inheritdoc
    */
  override val CheckpointsRootPath: String = instance
    .get("spark")
    .asInstanceOf[java.util.Map[String, Any]]
    .get("checkpointsRootPath")
    .asInstanceOf[String]

  /** Represents root path for initial seeding datasets.
    */
  val SeedRootPath: String = instance
    .get("spark")
    .asInstanceOf[java.util.Map[String, Any]]
    .get("seedRootPath")
    .asInstanceOf[String]

  /** @inheritdoc
    *
    * Note: Does not throw if not set, this is not used in Synapse.
    */
  override val MetastoreRootPath: String =
    Option(instance.get("spark").asInstanceOf[java.util.Map[String, Any]])
      .flatMap(_.asScala.get("metastoreRootPath").map(_.asInstanceOf[String]))
      .getOrElse("")

  /** @inheritdoc
    */
  override val SecretManagerConfiguration: java.util.Map[String, Any] = instance
    .get("secret")
    .asInstanceOf[java.util.Map[String, Any]]

  /** @inheritdoc
    */
  override val TokenCredentialConfiguration: java.util.Map[String, Any] =
    instance
      .get("tokenCredential")
      .asInstanceOf[java.util.Map[String, Any]]

  /** @inheritdoc
    */
  override val DriverConfiguration: java.util.Map[String, Any] = instance
    .get(driverName)
    .asInstanceOf[java.util.Map[String, Any]]

  /** @inheritdoc
    */
  override val TelemetryConfigation: OpenTelemetryConfiguration = {
    Option(instance.get("telemetry"))
      .map(_.asInstanceOf[java.util.Map[String, Any]])
      .map { telemetryMap =>
        OpenTelemetryConfiguration(
          url = telemetryMap.getOrDefault("url", "").asInstanceOf[String],
          audience = telemetryMap.getOrDefault("audience", "").asInstanceOf[String],
          isRelay = telemetryMap.getOrDefault("isRelay", false).asInstanceOf[Boolean]
        )
      }
      .getOrElse(OpenTelemetryConfiguration())
  }

  /** Replaces placeholders in the given configuration file content with appropriate values.
    *
    * @param configFileContent
    *   The content of the configuration file.
    * @return
    *   The modified configuration file content with placeholders replaced.
    */
  // @formatter:off
  private def replacePlaceholders(configFileContent: String): String = {

    // Git is only available locally and in GCI, not in Synapse.
    // Note, we must operate on the content since the class hasn't
    // been fully initialized yet.
    //
    if (configFileContent.matches("(?s).*local:\\s+true.*")) {

      // {GIT_ROOT} is different for ADO and Devcontainer
      //
      val gitCommand = "git rev-parse --show-toplevel"
      val gitRoot = Process(gitCommand).!!

      configFileContent
        .replaceAll("\\{GIT_ROOT\\}", gitRoot.replaceAll("\\r?\\n", ""))
        .replaceAll("\\{RANDOM_STRING\\}", System.getProperty(RuntimeAccessibleSystemProperties.PropRandomStringPrefix) + java.util.UUID.randomUUID.toString)

    } else {
      configFileContent
    }
  }

  /** Sources the configuration file content from filesystem.
    *
    * Notes:
    *
    * - In Fabric, the Spark session needs to be initialized to grab OneLake shortcuts.
    *   We also use notebookutils, which is the latest API:
    *
    *   >>> https://learn.microsoft.com/en-us/fabric/data-engineering/notebook-utilities
    *
    * @param configFilePath
    *   The path of the configuration file.
    * @return
    *   The content of the configuration file.
    */
  private def getConfigFromFilesystem(configFilePath: String): String = {
    if (this.isRunningInFabric()) {
      val _ = SparkSession.builder.appName("default").getOrCreate()
      notebookutils.fs.head(configFilePath)
    }
    else if (this.isRunningInSynapse()) {
      mssparkutils.fs.head(configFilePath)
    } else {
      Source.fromFile(configFilePath).mkString
    }
  }
  // @formatter:off
}
