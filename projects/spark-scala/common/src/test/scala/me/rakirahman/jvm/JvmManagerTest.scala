package me.rakirahman.jvm

import me.rakirahman.config.EnvironmentConfiguration
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class JvmManagerTest extends AnyFunSpec with Matchers {

  class TestEnvConfig extends EnvironmentConfiguration {
    override def config(): java.util.Map[String, Any] = new java.util.HashMap[String, Any]()
  }

  describe("JvmManager") {

    it("should be constructable via companion object") {
      val config = new TestEnvConfig
      val manager = JvmManager(config)
      manager should not be null
    }
  }
}
