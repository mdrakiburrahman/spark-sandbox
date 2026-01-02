package me.rakirahman.spark

import me.rakirahman.config.EnvironmentConfiguration
import me.rakirahman.jvm.JvmManager
import me.rakirahman.spark.SparkSessionExtensions._

import org.apache.spark.internal.Logging
import org.apache.spark.SparkConf
import org.apache.spark.sql.SparkSession

/** Manages the SparkSession for the given environment configuration.
  *
  * @param envConfig
  *   The environment configuration to use for SparkSession creation.
  * @param jvmManager
  *   The JVM Manager to use for displaying JVM information.
  * @param injectedConfigs
  *   An optional map of injected configurations to apply to the SparkSession.
  */
class SparkSessionManager(
    envConfig: EnvironmentConfiguration,
    jvmManager: JvmManager,
    injectedConfigs: Option[Map[String, String]] = None
) extends Logging {

  /** Creates a public SparkSession object that gets executed on first access. Depending on Environment Configuration, able to run locally or in Cluster.
    */
  lazy val session: SparkSession = {

    val spark = envConfig.LocalSpark match {
      case true  => local
      case false => provided
    }

    spark.withFabricSqlConfigInjected()
  }

  /** Creates a private local SparkSession object that gets executed on first access. Used to create a new Spark session with a distinguished App Name on the local machine.
    */
  private lazy val local: SparkSession = {

    // @formatter:off
    var builder = SparkSession
      .builder()
      .appName("local-session")
      .config("spark.sql.warehouse.dir", envConfig.WarehouseRootPath)
      // "local[*]" instructs Spark to allocate all threads available on the
      // host's logical cores to a single job, this is great for local
      // development; whereas "local" allocates a single thread:
      //
      // >>> https://spark.apache.org/docs/latest/submitting-applications.html#master-urls
      //
      // However, since our test suites run in forked mode, this can lead to
      // flaky behavior when both Spark and SBT are trying to allocate work
      // across a finite number threads.
      //
      // So in test mode, we only allocate a single thread to Spark, and let sbt
      // handle the parallelism. Since in test mode, we also set shuffle
      // partitions to 1, this works out nicely (1 thread == 1 partition)
      //
      .config("spark.master", if (envConfig.isRunningInTest()) "local" else "local[*]")
      .config("spark.sql.catalog.spark_catalog", "org.apache.spark.sql.delta.catalog.DeltaCatalog")
      // These values are only respected when Spark Session is initiated outside
      // of spark-submit, such as 'sbt test' where scala programmatically
      // invokes a Spark Session outside of the master node. When 'spark-submit' is
      // used, these values **must** be passed in via conf to take effect:
      //
      // >>> https://stackoverflow.com/a/53942466/8954538
      // >>> https://spark.apache.org/docs/latest/configuration.html#dynamically-loading-spark-properties
      //
      .config("spark.driver.cores", s"${envConfig.SparkDriverCores}")
      .config("spark.driver.memory", envConfig.SparkDriverMemory)
      .config("spark.executor.cores", s"${envConfig.SparkExecutorCores}")
      .config("spark.executor.memory", envConfig.SparkExecutorMemory)
      .config("spark.ui.enabled", s"${envConfig.SparkJettyUIEnabled}")
      .config("spark.memory.offHeap.enabled", envConfig.SparkOffHeapMemoryEnabled)
      .config("spark.memory.offHeap.size", s"${envConfig.SparkOffHeapMemory}")
      // Small shuffle partitions (1) significantly speeds up test suite runtime:
      //
      // >>> https://mrpowers.medium.com/how-to-cut-the-run-time-of-a-spark-sbt-test-suite-by-40-52d71219773f
      // >>> https://github.com/holdenk/spark-testing-base/pull/291
      //
      // But keep it at the default (200) for local development with spark-submit.
      //
      .config("spark.sql.shuffle.partitions", s"${envConfig.SparkShufflePartitions}")
      // Spark 3.3.1 - our current Synapse version, has a blocking correctness
      // warning when chaining stateful operations - such as stream-stream to
      // stream-stream joins.
      //
      // In Spark 3.4.0, this was fixed in the engine, guaranteeing that chaining stateful
      // operations did not produce delayed records. For now, we have to work around the
      // warning:
      //
      // >>> https://www.waitingforcode.com/apache-spark-structured-streaming/what-new-apache-spark-3.4.0-structured-streaming-correctness-issue/read#correctness_issue_apache_spark
      //
      .config("spark.sql.streaming.statefulOperator.checkCorrectness.enabled", "false")
      // Use the RocksDB State store implementation for stateful Structured
      // Streaming. Overall, the RocksDB implementation is superior to HDFS,
      // because the HDFS is prone to OOMKILLs due to it using heavy in-memory
      // caching for state discovery.
      //
      // On the other hand, the RocksDB one is disk I/O intensive, so if you're
      // running a streaming application locally that continuously updates
      // state, you can run into the small file problem - so we allow the caller
      // to override via env config.
      //
      // Problems with HDFS and the RocksDB State Store config described here:
      //
      // >>> https://spark.apache.org/docs/3.5.0/structured-streaming-programming-guide.html#rocksdb-state-store-implementation
      //
      .config("spark.sql.streaming.stateStore.providerClass", s"${envConfig.StateStoreProviderClass}")

    // Configure Hive MetaStore with Derby, if path set.
    // Do not use for tests due to single-session lock:
    //
    // >>> https://issues.apache.org/jira/browse/SPARK-4758
    //
    if (
      envConfig.MetastoreRootPath != null && envConfig.MetastoreRootPath != ""
    ) {
      builder = builder
        .config("spark.sql.catalogImplementation", "hive")
        .config("spark.driver.extraJavaOptions", s"-Dderby.system.home='${envConfig.MetastoreRootPath}'")
    } else {
      builder = builder.config("spark.sql.catalogImplementation", "in-memory")
    }

    this.withInjectedConfigs(builder)

    builder.getOrCreate()
    // @formatter:on
  }

  /** Retrieves the SparkSession object from the Cluster. In environments that this has been created upfront (e.g. Synapse, Fabric, Databricks), uses the builder to get an existing session instead of creating one.
    */
  private lazy val provided: SparkSession = {
    var builder = SparkSession.builder()
    this.withInjectedConfigs(builder)
    builder.getOrCreate()
  }

  /** Adds additional configurations to the provided [[SparkSession.Builder]] instance.
    *
    * @param builder
    *   The [[SparkSession.Builder]] instance to which extra configurations will be added.
    * @return
    *   A [[SparkSession.Builder]] instance with the extra configurations applied, if any. If no extra configurations are provided, the original builder is returned unchanged.
    */
  // @formatter:off
  private def withInjectedConfigs(
      builder: SparkSession.Builder
  ): SparkSession.Builder = {
    injectedConfigs match {
      case Some(configs) => configs.foldLeft(builder) { case (b, (k, v)) => b.config(k, v) }
      case None          => builder
    }
  }
  // @formatter:on
}

/** Companion object for SparkSessionManager.
  */
object SparkSessionManager extends Logging {

  /** Constructor.
    *
    * @param envConfig
    *   The EnvironmentConfiguration to use for loading and transforming data.
    * @param injectedConfigs
    *   An optional map of injected configurations to apply to the [[SparkSession]], any key here takes the highest priority.
    */
  // @formatter:off
  def apply(
      envConfig: EnvironmentConfiguration,
      injectedConfigs: Option[Map[String, String]] = None
  ): SparkSessionManager = {

    val defaultConfigs = Map(

      // Configure filters for Synapse to our classes to significantly reduce
      // log volume:
      //
      // >>> https://learn.microsoft.com/en-us/azure/synapse-analytics/spark/azure-synapse-diagnostic-emitters-azure-eventhub
      //
      // - filter.loggerName/eventName/metricName.match: Matches specific names (comma separated)
      // - filter.loggerName/eventName/metricName.regex: Matches RegEx; e.g.:
      //
      //   - ".*" : Match all
      //   - "(me.rakirahman(.*))$" : Match our namespaces
      //
      "spark.synapse.diagnostic.emitter.eventhub.filter.loggerName.regex" -> "(me.rakirahman(.*))$",
    )

    val mergedConfigs = {
      val defaultKeys = (injectedConfigs.getOrElse(Map.empty).keys ++ defaultConfigs.keys).toSet
      val sparkSubmitConfigs = new SparkConf().getAll.toMap.filter { case (key, _) => defaultKeys.contains(key) }

      defaultKeys.foreach { k => logDebug(s"Default Config: ${k}  -> ${defaultConfigs.getOrElse(k, "(no default)")}")}
      sparkSubmitConfigs.foreach { case (k, v) => logDebug(s"Spark Submit Config: ${k} -> ${v}") }

      // If a value exists in Spark Submit, it is prioritized over default config.
      // Injected config at the constructor level is prioritized over everything else.
      //
      // 1. injectedConfigs (highest priority)
      // 2. sparkSubmitConfigs
      // 3. defaultConfigs (lowest priority)
      //
      val withDefaults = defaultConfigs ++ sparkSubmitConfigs
      injectedConfigs match {
        case Some(injected) => withDefaults ++ injected
        case None           => withDefaults
      }
    }

    mergedConfigs.foreach { case (k, v) => logDebug(s"Final Merged Config: ${k} -> ${v}") }

    new SparkSessionManager(
      envConfig,
      new JvmManager(envConfig),
      Some(mergedConfigs)
    )
  }
  // @formatter:on
}
