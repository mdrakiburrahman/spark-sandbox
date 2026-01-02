package me.rakirahman.jvm

import me.rakirahman.config.EnvironmentConfiguration
import java.lang.management.ManagementFactory

/** Manages the JVM for the given environment configuration.
  *
  * @param envConfig
  *   The environment configuration to use for SparkSession creation.
  */
class JvmManager(envConfig: EnvironmentConfiguration) {

  /** Displays information about the JVM.
    */
  def displayJVMInfo(): Unit = {

    val runtime = Runtime.getRuntime
    val mxBean = ManagementFactory.getRuntimeMXBean
    val jvmName = mxBean.getName
    val jvmVersion = System.getProperty("java.version")
    val jvmVendor = System.getProperty("java.vendor")
    val uptime = mxBean.getUptime
    val startTime = mxBean.getStartTime
    val pid = mxBean.getName.split("@").headOption.getOrElse("Unknown PID")
    val jvmArgs = mxBean.getInputArguments
    val classPath = mxBean.getClassPath
    val bootClassPath = mxBean.getBootClassPath
    val libraryPath = mxBean.getLibraryPath
    val systemProperties = mxBean.getSystemProperties

    // Display only the non-noisy information.
    //
    val stringBuilder = new StringBuilder

    stringBuilder.append("\n" + "=" * 80 + "\n")
    stringBuilder.append(s"JVM Name: $jvmName\n")
    stringBuilder.append(s"JVM Version: $jvmVersion\n")
    stringBuilder.append(s"JVM Vendor: $jvmVendor\n")
    stringBuilder.append(s"JVM Uptime: $uptime milliseconds\n")
    stringBuilder.append(s"JVM Start Time: $startTime milliseconds\n")
    stringBuilder.append("=" * 80 + "\n")
  }
}

/** Companion object for JvmManager.
  */
object JvmManager {

  /** Constructor.
    *
    * @param envConfig
    *   The EnvironmentConfiguration to use for loading and transforming data.
    */
  def apply(envConfig: EnvironmentConfiguration): JvmManager =
    new JvmManager(envConfig)
}
