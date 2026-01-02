package me.rakirahman.sparkdemo.config

import me.rakirahman.config._
import java.io.{File, FileInputStream}
import org.yaml.snakeyaml.Yaml
import scala.collection.JavaConverters._
import scala.io.Source
import scala.sys.process._

/** Demo Job Environment Configuration.
  *
  * @param inDriverName
  *   The name of the driver.
  * @param inFileName
  *   The name of the YAML file containing the configuration.
  */
class DemoEnvironmentConfiguration(inDriverName: String, inFileName: String) extends YamlEnvironmentConfiguration {

  /** @inheritdoc
    */
  override def driverName: String = inDriverName

  /** @inheritdoc
    */
  override def fileName: String = inFileName
}

/** Companion object for DemoEnvironmentConfiguration.
  */
object DemoEnvironmentConfiguration {

  /** Constructor.
    *
    * @param driverName
    *   The name of the driver.
    * @param fileName
    *   The name of the YAML file containing the configuration.
    */
  def apply(
      driverName: String,
      fileName: String
  ): DemoEnvironmentConfiguration =
    new DemoEnvironmentConfiguration(driverName, fileName)
}
