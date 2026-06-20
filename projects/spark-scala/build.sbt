/*
 * Sbt-based build definition for all Spark Projects. Each project can contain
 * several main entry points ("extends App") that can be controlled during
 * spark-submit (e.g. Spark jobs) and is packaged as a fat jar.
 */

import Dependencies._
import RunSettingsPlugin._
import Settings._
import Version._

ThisBuild / scalaVersion := "2.12.17"

scalafmtOnCompile := true

// @formatter:on
lazy val root = project
  .in(file("."))
  // Scala project does not need to be packaged
  .disablePlugins(AssemblyPlugin)
  .settings(
    name := "spark-scala",
    resolvers := Seq.empty,
    credentials := Seq.empty,
    version := version.value
  ) aggregate (commonExecutor, common, sparkDemo)

// commonExecutor: These are classes that are invoked by reflection on executors etc.
// Use extra caution and test in Cloud when adding dependencies, because
// reflection can conflict with classpath libraries that we cannot control
// in cloud.
//
// Here's an example where Event Hub uses reflection to construct classes for Entra ID
// that is error prone from classpath:
//
// >>> https://github.com/Azure/azure-event-hubs-spark/blob/a1d92a93dcfdf5b68a46169c6c43750df3231afc/core/src/main/scala/org/apache/spark/eventhubs/EventHubsConf.scala#L639C1-L645C9
//
lazy val commonExecutor = project
  .in(file("common-executor"))
  .settings(
    name := "commonExecutor",
    resolvers ++= Seq.empty,
    credentials ++= Seq.empty,
    commonExecutorAssemblySettings,
    testSettings,
    coverageSettings,
    coverageExcludedPackages := Seq(
      // Spark plugins require full cluster lifecycle and are not unit-testable
      "me\\.rakirahman\\.spark\\.plugin\\.uncachingplugin\\..*",
      "me\\.rakirahman\\.spark\\.plugin\\.httpdumperplugin\\.HttpDumper.*Plugin.*",
      "me\\.rakirahman\\.spark\\.plugin\\.httpdumperplugin\\.HttpDumper.*Server.*",
      "me\\.rakirahman\\.spark\\.plugin\\.rpcplugin\\..*",
      // AdlsOAuthTokenProvider plugin lifecycle classes (conf is tested separately)
      "me\\.rakirahman\\.spark\\.plugin\\.adlsoauthtokenproviderplugin\\.AdlsOAuthTokenProvider.*",
      // Secret manager, handlers and credential chain hit Key Vault / mssparkutils / az CLI
      "me\\.rakirahman\\.secret\\..*",
      "me\\.rakirahman\\.runtime\\..*"
    ).mkString(";"),
    version := commitVersion.value,
    libraryDependencies ++= azureKeyVaultDependencies
      ++ deltaDependencies
      ++ fileTypeDependencies
      ++ httpServerDependencies
      ++ jacksonDependencies
      ++ sparkDependencies
      ++ sparkTestDependencies
      ++ synapseProvidedDependencies
      ++ testDependencies
  )

// Common: Imports for traits, objects, utility methods etc.
//
lazy val common = project
  .in(file("common"))
  .settings(
    name := "common",
    resolvers ++= Seq.empty,
    credentials ++= Seq.empty,
    genericAssemblySettings,
    testSettings,
    coverageSettings,
    coverageExcludedPackages := Seq(
      // Fabric/Synapse classes depend on mssparkutils and are not unit-testable
      "me\\.rakirahman\\.feeds\\.storage\\.filesystem\\.fabric\\..*",
      "me\\.rakirahman\\.config\\.YamlEnvironmentConfiguration",
      "me\\.rakirahman\\.spark\\.SparkSessionManager",
      "me\\.rakirahman\\.spark\\.SparkSessionExtensions.*",
      // JvmManager uses getBootClassPath which is unsupported on Java 17
      "me\\.rakirahman\\.jvm\\..*",
      // DeltaUpserter retry/error paths require mocking concurrent Delta merge failures
      "me\\.rakirahman\\.etl\\.transformer\\.merge\\.DeltaUpserter.*",
      // OpenLineage schema constants are tested via sparkDemo integration tests
      "me\\.rakirahman\\.etl\\.schema\\.openlineage\\..*",
      // Sequencer execution framework is tested via sparkDemo integration tests
      "me\\.rakirahman\\.etl\\.execution\\.stateless\\..*",
      // DataTransformer abstract trait is tested via sparkDemo implementations
      "me\\.rakirahman\\.etl\\.transformer\\.DataTransformer",
      // DeltaTableMaintenanceManager requires SparkSession and is tested via Jest integration tests
      "me\\.rakirahman\\.quality\\.maintenance\\.manager\\.DeltaTableMaintenanceManager"
    ).mkString(";"),
    version := version.value,
    libraryDependencies ++= azureNetworkingDependencies
      ++ deltaDependencies
      ++ sparkDependencies
      ++ sparkTestDependencies
      ++ synapseDependencies
      ++ testDependencies
  )
  .dependsOn(
    commonExecutor % "compile->compile;test->test"
  )

// Workloads running on demo Synapse/Fabric
//
lazy val sparkDemo = project
  .in(file("spark-demo"))
  .settings(
    name := "sparkDemo",
    resolvers := Seq.empty,
    credentials := Seq.empty,
    genericAssemblySettings,
    testSettings,
    coverageSettings,
    // App entry points + config requiring mssparkutils (tested via Jest/integration)
    coverageExcludedPackages := "me\\.rakirahman\\.sparkdemo\\..*",
    version := version.value,
    // The provided scope packages are not available from common, it seems.
    libraryDependencies ++= sparkDependencies
  )
  .dependsOn(
    common % "compile->compile;test->test"
  )
  // Loads dependencies during sbt run
  .enablePlugins(RunSettingsPlugin)