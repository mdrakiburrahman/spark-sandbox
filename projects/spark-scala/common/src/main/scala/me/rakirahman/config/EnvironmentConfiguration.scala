package me.rakirahman.config

/** Enumeration defining the different types of Spark runtimes.
  */
object SparkRuntime extends Enumeration {
  type RuntimeTypes = Value
  val Devcontainer = Value("devcontainer")
  val Synapse = Value("synapse")
  val Fabric = Value("fabric")
}

/** Definition of the environment configuration for the whole system.
  */
trait EnvironmentConfiguration {

  /** Spark running locally or in a cluster.
    */
  val LocalSpark: Boolean = true

  /** Debug/Verbose enabled.
    */
  val DebugEnabled: Boolean = false

  /** Spark Jetty UI when Job starts - disable to save resources.
    */
  val SparkJettyUIEnabled: Boolean = false

  /** Spark Off-Heap Memory Enabled.
    */
  val SparkOffHeapMemoryEnabled: Boolean = true

  /** Warehouse Root Path.
    */
  val WarehouseRootPath: String = ""

  /** Checkpoints Root Path.
    */
  val CheckpointsRootPath: String = ""

  /** Hive Metastore Root Path.
    */
  val MetastoreRootPath: String = ""

  /** Spark Driver Cores.
    */
  val SparkDriverCores: Integer = 4

  /** Spark Driver Memory.
    */
  val SparkDriverMemory: String = "8g"

  /** Spark Executor Cores.
    */
  val SparkExecutorCores: Integer = 4

  /** Spark Executor Memory.
    */
  val SparkExecutorMemory: String = "8g"

  /** Spark off-heap memory.
    */
  val SparkOffHeapMemory: String = "16g"

  /** Spark shuffle partitions.
    */
  val SparkShufflePartitions: Integer = 200

  /** OneLake Shortcut prefix for Fabric.
    */
  val OneLakeShortcutPrefix: String = "Files/onelake"

  /** Spark State Store provider.
    */
  val StateStoreProviderClass: String =
    "org.apache.spark.sql.execution.streaming.state.RocksDBStateStoreProvider"

  /** Secret handler configuration.
    */
  val SecretManagerConfiguration: java.util.Map[String, Any] =
    new java.util.HashMap[String, Any]()

  /** Token Credential configuration.
    */
  val TokenCredentialConfiguration: java.util.Map[String, Any] =
    new java.util.HashMap[String, Any]()

  /** ETL Driver configuration.
    */
  val DriverConfiguration: java.util.Map[String, Any] =
    new java.util.HashMap[String, Any]()

  /** Telemetry configuration.
    */
  val TelemetryConfigation: OpenTelemetryConfiguration = OpenTelemetryConfiguration()

  /** Returns configuration.
    *
    * @return
    *   The configuration.
    */
  def config(): java.util.Map[String, Any] = ???

  /** Checks if the current environment is running in Synapse.
    *
    * @return
    *   Boolean value indicating whether the application is running in Synapse.
    */
  def isRunningInSynapse(): Boolean =
    sys.props.get("spark.cluster.type").contains("synapse")

  /** Checks if the current environment is running in Fabric.
    *
    * @return
    *   Boolean value indicating whether the application is running in Fabric.
    */
  def isRunningInFabric(): Boolean =
    sys.props.get("spark.cluster.type").contains("trident")

  /** Checks if the current environment is running inside a test suite.
    *
    * @return
    *   Boolean value indicating whether the application is running as a test.
    */
  def isRunningInTest(): Boolean =
    sys.props.contains(RuntimeAccessibleSystemProperties.PropSbtTestName)

  /** Returns the current Spark runtime environment.
    *
    * @return
    *   The [[SparkRuntime]].
    */
  def runtime(): SparkRuntime.RuntimeTypes =
    if (LocalSpark) SparkRuntime.Devcontainer
    else if (isRunningInSynapse()) SparkRuntime.Synapse
    else if (isRunningInFabric()) SparkRuntime.Fabric
    else throw new IllegalStateException("Unknown Spark runtime environment")
}
