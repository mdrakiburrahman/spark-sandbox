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
    version := commitVersion.value,
    libraryDependencies ++= deltaDependencies
      ++ fileTypeDependencies
      ++ sparkDependencies
      ++ sparkTestDependencies
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
    version := version.value,
    libraryDependencies ++= azureNetworkingDependencies
      ++ httpServerDependencies
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
    version := version.value,
    // The provided scope packages are not available from common, it seems.
    libraryDependencies ++= sparkDependencies
  )
  .dependsOn(
    common % "compile->compile;test->test"
  )
  // Loads dependencies during sbt run
  .enablePlugins(RunSettingsPlugin)