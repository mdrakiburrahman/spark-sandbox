package me.rakirahman.sparkdemo.etl.drivers.general.management

import me.rakirahman.etl.driver.DriverOpts

import scala.beans.BeanProperty
import scala.collection.JavaConverters._

/** Settings for the DeltaMountDriver.
  */
class DeltaMountDriverSettings extends DriverOpts {
  @BeanProperty var DeltaMountDriver: DeltaMountDriverConfig = new DeltaMountDriverConfig

  override def isValid: Boolean = {
    val driver = this.DeltaMountDriver
    driver != null &&
    driver.Mounts != null &&
    driver.Mounts.nonEmpty &&
    driver.Mounts.forall { mount =>
      mount != null &&
      mount.Database != null && mount.Database.nonEmpty &&
      mount.RootPath != null && mount.RootPath.nonEmpty
    }
  }
}

/** Configuration for the DeltaMountDriver.
  */
class DeltaMountDriverConfig {
  @BeanProperty var Mounts: Array[DeltaMountConfig] = Array.empty
}

/** Configuration for a single database mount.
  */
class DeltaMountConfig {
  @BeanProperty var Database: String = null
  @BeanProperty var RootPath: String = null
}
