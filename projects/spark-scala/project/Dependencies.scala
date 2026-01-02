import sbt._

/* ┌──────────────┐
 * │ DEPENDENCIES │
 * └──────────────┘
 */
object Dependencies {

  /* Packages must be aligned with Synapse/Fabric runtime:
   *
   *  >>> https://learn.microsoft.com/en-us/azure/synapse-analytics/spark/apache-spark-35-runtime
   *
   * For any packages that are too large, but are already included in the Synapse runtime,
   * we shouldn't include them in the JAR as the size becomes massive.
   *
   * Options are:
   *
   *    1. For Test time references only, use % "test" to include the package in the test classpath
   *    2. For spark-submit, use --conf "spark.jars.packages=org.apache.hadoop:hadoop-azure:X.X.X,org.apache.hadoop:hadoop-azure-datalake:X.X.X"
   *
   * Details:
   *
   *  >>> https://stackoverflow.com/questions/74817396/spark-ignoring-package-jars-included-in-the-configuration-of-my-spark-session
   *  >>> https://issues.apache.org/jira/browse/SPARK-38438
   *
   * Note that this only works for a package Spark itself needs. If we specifically reference a
   * package in our Scala code at compile time, neither of these options will obviously work (import fails)
   * and so we must build an Uber Jar.
   *
   * Pinned versions due to known issues:
   *
   * --------------------------------------------- SAMPLE ------------------------------------------------
   * - [package:X.X.X]
   *
   *   Describe your reason for pinning so the next persion that bumps knows what to look for.
   *
   * --------------------------------------------- SAMPLE ------------------------------------------------
   */
    // @formatter:off
    lazy val dependencies =
        new {
            // %% - adds Scala suffixes to artifact names (e.g. mylib_2.12)
            // %  - Java package, does not add Scala suffixes to artifact names (e.g. mylib)
            //
            val azureNettyHttp                          = "com.azure"                              %  "azure-core-http-netty"                                  % "1.15.4"
            val deltaSpark                              = "io.delta"                               %% "delta-spark"                                            % "3.2.0"
            val httpNano                                = "org.nanohttpd"                          %  "nanohttpd"                                              % "2.3.1"
            val scalaTest                               = "org.scalatest"                          %% "scalatest"                                              % "3.2.18"
            val scalaTestPlus                           = "org.scalatestplus"                      %% "scalacheck-1-18"                                        % "3.2.18.0"
            val snakeYaml                               = "org.yaml"                               %  "snakeyaml"                                              % "2.2"
            val sparkCatalyst                           = "org.apache.spark"                       %% "spark-catalyst"                                         % "3.5.1"
            val sparkCore                               = "org.apache.spark"                       %% "spark-core"                                             % "3.5.1"
            val sparkSql                                = "org.apache.spark"                       %% "spark-sql"                                              % "3.5.1"
            val sparkStreaming                          = "org.apache.spark"                       %% "spark-streaming"                                        % "3.5.1"
            val synapseUtils                            = "com.microsoft.azure.synapse"            %% "synapseutils"                                           % "1.5.4"
        }

    /**
     * Multiple SLF4J's in the classpath produces annoying logging like this:
     *
     *    ```
     *    SLF4J: Class path contains multiple SLF4J providers.
     *    SLF4J: Found provider [ch.qos.logback.classic.spi.LogbackServiceProvider@39ba9bd2]
     *    SLF4J: Found provider [org.apache.logging.slf4j.SLF4JServiceProvider@3820c045]
     *    SLF4J: Found provider [org.slf4j.simple.SimpleServiceProvider@59d1a39c]
     *    SLF4J: See https://www.slf4j.org/codes.html#multiple_bindings for an explanation.
     *    ```
     */
    lazy val slf4jExclusions = Seq(
        ExclusionRule(organization = "org.slf4j", name = "slf4j-simple"),
    )

   /* provided  - dependency is available on target machine, do not include in artifact
    *             (reduces Jar size significantly)
    * test      - dependency is only used for test runs, do not include in artifact
    */
    lazy val azureNetworkingDependencies = Seq(
        dependencies.azureNettyHttp,
    )
    
    lazy val deltaDependencies = Seq(
        dependencies.deltaSpark
    )

    lazy val fileTypeDependencies = Seq(
        dependencies.snakeYaml,
    )

    lazy val httpServerDependencies = Seq(
        dependencies.httpNano
    )

    lazy val sparkDependencies = Seq(
        dependencies.sparkSql                   % "provided",
        dependencies.sparkStreaming             % "provided"
    ).map(_.excludeAll(slf4jExclusions: _*))

    lazy val sparkTestDependencies = Seq(
        dependencies.sparkCatalyst              % "test" classifier "tests",
        dependencies.sparkCore                  % "test" classifier "tests",
        dependencies.sparkSql                   % "test" classifier "tests",
    ).map(_.excludeAll(slf4jExclusions: _*))

    lazy val synapseDependencies = Seq(
        dependencies.synapseUtils
    )

    lazy val testDependencies = Seq(
        dependencies.scalaTest                  % "test",
        dependencies.scalaTestPlus              % "test",
    )
    // @formatter:on

}
