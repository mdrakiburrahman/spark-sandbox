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
   * - [azure-identity:1.8.2]
   *
   *   In order to work with Synapse Spark 3.4 and azure-core, must be 1.8.2, see https://github.com/Azure/azure-sdk-for-java/issues/37683#issuecomment-1826388305
   *   Before upgrading, ensure you test Synapse runtime to obtain SNI credential.
   *
   * - [azure-xml:1.0.0-beta.3]
   *
   *   azure-core references an obscure class [[com.azure.xml.XmlProviders]] that's only available in beta:
   *
   *   >>> https://github.com/Azure/azure-sdk-for-java/issues/34462
   *   >>> https://github.com/Azure/azure-docs-sdk-java/blob/main/preview/docs-ref-autogen/com.azure.xml.yml
   */
    // @formatter:off
    lazy val dependencies =
        new {
            // %% - adds Scala suffixes to artifact names (e.g. mylib_2.12)
            // %  - Java package, does not add Scala suffixes to artifact names (e.g. mylib)
            //
            val scalaTest                               = "org.scalatest"                          %% "scalatest"                                              % "3.2.18"
            val scalaTestPlus                           = "org.scalatestplus"                      %% "scalacheck-1-18"                                        % "3.2.18.0"
        }

    lazy val testDependencies = Seq(
        dependencies.scalaTest                  % "test",
        dependencies.scalaTestPlus              % "test",
    )
    // @formatter:on

}
