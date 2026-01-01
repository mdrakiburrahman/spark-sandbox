import com.eed3si9n.jarjarabrams.ShadeRule
import sbt._
import sbt.Keys._
import sbtassembly._
import sbtassembly.AssemblyKeys._
import scala.collection.JavaConverters._
import scala.sys.process._
import scala.util.{Try, Success, Failure}

/* ┌──────────┐
 * │ SETTINGS │
 * └──────────┘
 */
// @formatter:off
object Settings {

  /**
    * Test report options
    */
  lazy val testReportOptions = Seq(
      "-oFD",
      "-u",
      "test-reports",
      "-fW",
      "test-reports/TEST-summary.log"
  )

  /** Shading - the game changer for escaping Synapse Spark dependency hell:
    *
    * >>> https://github.com/sbt/sbt-assembly?tab=readme-ov-file#shading
    * >>> https://gist.github.com/laughedelic/f16beb155ac2d258c1d06d7823d5ffc4#file-sbt-dependency-management-guide-md
    */
  val azureShadingRules = Seq(

      // azure.core's dependency on netty
      //
      // >>> https://github.com/Azure/azure-sdk-for-java/issues/22569#issuecomment-879308167
      //
      ShadeRule.rename("io.netty.**" -> "shade.rakirahman.@0").inAll,
      ShadeRule.rename("reactor.netty.**" -> "shade.rakirahman.@0").inAll,

      // azure.core's dependency on jackson and Synapse not liking it
      //
      // >>> https://github.com/Azure/azure-sdk-for-java/issues/25732
      // >>> https://github.com/Azure/azure-sdk-for-java/issues/25734
      // >>> https://learn.microsoft.com/en-us/azure/developer/java/sdk/troubleshooting-dependency-version-conflict#create-a-fat-jar
      //
      ShadeRule.rename("com.fasterxml.jackson.**" -> "shade.rakirahman.@0").inAll,
      ShadeRule.rename("com.azure.**" -> "shade.rakirahman.@0").inAll,

      // Fabric forces redirect in their Azure SQL proxy, which only works with the newer
      // JDBC drivers. Synapse by default loads an old JDBC driver in the classpath, which
      // doesn't work with redirect:
      //
      // >>> https://github.com/microsoft/synapse-spark-runtime/blob/668416e7fb3ef4a7a192f989ce020bf0017e3397/Fabric/Runtime%201.3%20(Spark%203.5)/Candidate-Spark3.5-Rel-2024-07-31.1-rc.1.md?plain=1#L936
      //
      ShadeRule.rename("com.microsoft.sqlserver.jdbc.**" -> "shade.rakirahman.@0").inAll,

      // Shading FMV extension to avoid classpath conflicts.
      //
      ShadeRule.rename("com.microsoft.azure.fabric.**" -> "shade.rakirahman.@0").inAll,

      // Shading the protobuf to match the versions defined in the official opentelemetry repo:
      //
      // >>> https://github.com/open-telemetry/opentelemetry-proto-java/blob/61a68be82214a920d12e3b5125403661eb80b60c/build.gradle.kts#L2
      //
      ShadeRule.rename("com.google.protobuf.**" -> "shade.rakirahman.@0").inAll,

  )

  /** "sbt assembly" settings
    */
  val commonExecutorAssemblySettings = Seq(
    assembly / assemblyJarName := name.value + "-" + version.value + ".jar",
    assembly / assemblyShadeRules := azureShadingRules,
    assembly / assemblyMergeStrategy := {
      case _                                                                   =>       MergeStrategy.first
    },
  )

  val genericAssemblySettings = Seq(
    assembly / assemblyOption ~= { _.withIncludeScala(false) },
    assembly / assemblyJarName := name.value + "-" + version.value + ".jar",
    assembly / assemblyShadeRules := azureShadingRules,
    assembly / assemblyMergeStrategy := {
      // Delta needs to be registered: https://github.com/delta-io/delta/issues/947#issuecomment-1048397561
      case "META-INF/services/org.apache.spark.sql.sources.DataSourceRegister" =>       MergeStrategy.concat
      case PathList("META-INF", xs @ _*)                                       =>       MergeStrategy.discard
      case PathList("log4j.properties")                                        =>       MergeStrategy.discard
      case "application.conf"                                                  =>       MergeStrategy.concat
      case _                                                                   =>       MergeStrategy.first
    },
  )

  /** "sbt test" settings
    *
    * >>> https://www.scala-sbt.org/1.x/docs/Testing.html#Forking+tests
    * >>> https://www.scala-sbt.org/1.x/docs/Forking.html
    *
    */
  val testSettings = List(
    /**
      * sbt forking jvm -- sbt provides 2 testing modes: forked vs not forked.
      *
      *    -------
      *    Forked
      *    -------
      *    Each test class is executed in a forked JVM separate from the sbt JVM.
      *    Test results are segregated, easier to read.
      *
      *    --------
      *    Unforked
      *    --------
      *    All tasks (test classes) are executed in same sbt JVM. Test
      *    results are not segregated, hard to read; error prone with noisy
      *    neighbors.
      *
      * true: Specify that all tests will be executed in a multiple external JVMs. By
      * default, tests executed in a forked JVM are executed sequentially.
      */
    Test / fork := true,

    /**
      * Forked tests can optionally be run in parallel.
      */
    Test / testForkedParallel := true,

    /**
      *  When forking, use the base directory as the working directory
      */
    Test / baseDirectory := (ThisBuild / baseDirectory).value,

    /**
     * Enables (true) or disables (false) parallel execution of tasks (test classes).
     *
     *    -------
     *    Forked
     *    -------
     *    Each test class runs tests in sequential order, in a separated jvm.
     *
     *    --------
     *    Unforked
     *    --------
     *    Test classes are run in parallel in different threads, in same sbt jvm.
     *
     */
    Test / parallelExecution := true,

    /**
      * Disable sbt's log buffering, easier to read.
      */
    Test / logBuffered := false,

    /**
      * Control the number of forked JVMs allowed to run at the same time by
      * setting the limit on Tags.ForkedTestGroup tag. 1 will essentially
      * serialize all tests across **all** JVMs.
      *
      * When running in parallel, it's important to ensure no files and folders
      * are shared between tests.
      */
    Global / concurrentRestrictions := Seq(Tags.limit(Tags.ForkedTestGroup, 16)),

    /**
      * Removes any other concurrent restrictions by setting it to a high number.
      */
    Global / concurrentRestrictions := Seq(Tags.limitAll(16)),

    /**
      * Reduces verbose logging from sbt.
      */
    Global / logLevel := Level.Info,
    Global / ivyLoggingLevel := UpdateLogging.Quiet,

    /**
      * This specifies the size of the thread pool used to run tests, P8 meaning
      * 8 threads.
      *
      * See executing suites in parallel section here:
      *
      * >>> https://www.scalatest.org/user_guide/using_the_runner
      * >>> https://www.scalatest.org/user_guide/using_scalatest_with_sbt
      *
      * Note that within a given suite, we're not running test methods in parallel,
      * since the state config (warehouse, checkpoints) is shared between them for now.
      */
    Test / testOptions += Tests.Argument(TestFrameworks.ScalaTest, "-P8"),

    /**
      * Forked JVM options
      */
    Test / javaOptions ++= Seq(
        // Max heap usage
        "-Xmx6G",
        // Workaround for HADOOP_HOME noisy check: https://stackoverflow.com/a/33449067
        "-Dhadoop.home.dir=/",
    ),

    /**
      * Copy system properties to forked JVM
      */
    Test / javaOptions ++= Seq({
      val props = System.getProperties
      props
        .stringPropertyNames()
        .asScala
        .toList
        .map { key => s"-D$key=${props.getProperty(key)}" }
        .mkString(" ")
    }),

    /**
      * Define test grouping per JVM
      */
    Test / testGrouping := {
      (Test / definedTests).value.map { test =>
        val options = ForkOptions()
          .withConnectInput(true)
          .withWorkingDirectory(Some((Test / baseDirectory).value))
          .withOutputStrategy(Some(sbt.StdoutOutput))
          .withRunJVMOptions(
            Vector(
              /**
               * Most of these noisy Apache projects use SLF4J for logging:
               *
               * >>> https://betterstack.com/community/guides/logging/java/logback/
               */
              s"-Dlogback.configurationFile=${(Test / baseDirectory).value.getAbsolutePath}/src/test/resources/logback-test.xml",
              s"-Djava.util.logging.config.file=${(Test / baseDirectory).value.getAbsolutePath}/src/test/resources/logback-test.xml",
              s"-Dtest.name=${test.name}",
              s"-Ddir.name=${(Test / baseDirectory).value}",
              s"-Dheadless=${Option(System.getProperty("headless")).getOrElse("false")}",
              /**
               * Java 17 requires these accessor flags for Unit Tests:
               *
               * >>> https://stackoverflow.com/questions/73465937/apache-spark-3-3-0-breaks-on-java-17-with-cannot-access-class-sun-nio-ch-direct#comment129881184_73504175
               * >>> https://github.com/apache/spark/blob/fd86f85e181fc2dc0f50a096855acf83a6cc5d9c/launcher/src/main/java/org/apache/spark/launcher/JavaModuleOptions.java#L27
               */
              "--add-exports", "java.base/sun.nio.ch=ALL-UNNAMED",
              "--add-exports", "java.base/sun.util.calendar=ALL-UNNAMED",
              /**
               * Arrow requires this accessor flag for Unit Tests:
               *
               * >>> https://arrow.apache.org/docs/java/install.html#java-compatibility
               *
               * ```text
               * [info]   Cause: java.lang.RuntimeException: Failed to initialize MemoryUtil. You must start Java with `--add-opens=java.base/java.nio=ALL-UNNAMED` (See https://arrow.apache.org/docs/java/install.html)
               * [info]   at org.apache.arrow.memory.util.MemoryUtil.<clinit>(MemoryUtil.java:143)
               * [info]   at org.apache.arrow.memory.UnsafeAllocationManager.<clinit>(UnsafeAllocationManager.java:27)
               * ```
               */
              "--add-opens",   "java.base/java.nio=ALL-UNNAMED",
            )
          )
        Tests.Group(
          name = test.name,
          tests = Seq(test),
          runPolicy = Tests.SubProcess(options)
        )
      }
    },
  )
}
// @formatter:on
