package me.rakirahman.config

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class EnvironmentConfigurationTest extends AnyFunSpec with Matchers {

  class TestEnvConfig extends EnvironmentConfiguration {
    override def config(): java.util.Map[String, Any] = new java.util.HashMap[String, Any]()
  }

  describe("EnvironmentConfiguration") {

    it("should have correct default values") {
      val config = new TestEnvConfig
      config.LocalSpark shouldBe true
      config.DebugEnabled shouldBe false
      config.SparkJettyUIEnabled shouldBe false
      config.SparkOffHeapMemoryEnabled shouldBe true
      config.WarehouseRootPath shouldBe ""
      config.CheckpointsRootPath shouldBe ""
      config.MetastoreRootPath shouldBe ""
      config.SparkDriverCores shouldBe 4
      config.SparkDriverMemory shouldBe "8g"
      config.SparkExecutorCores shouldBe 4
      config.SparkExecutorMemory shouldBe "8g"
      config.SparkOffHeapMemory shouldBe "16g"
      config.SparkShufflePartitions shouldBe 200
      config.OneLakeShortcutPrefix shouldBe "Files/onelake"
      config.StateStoreProviderClass shouldBe "org.apache.spark.sql.execution.streaming.state.RocksDBStateStoreProvider"
      config.SecretManagerConfiguration shouldBe a[java.util.HashMap[_, _]]
      config.TokenCredentialConfiguration shouldBe a[java.util.HashMap[_, _]]
      config.DriverConfiguration shouldBe a[java.util.HashMap[_, _]]
      config.TelemetryConfigation shouldBe OpenTelemetryConfiguration()
    }

    it("should detect running in test when test.name is set") {
      val config = new TestEnvConfig
      System.setProperty(RuntimeAccessibleSystemProperties.PropSbtTestName, "someTest")
      config.isRunningInTest() shouldBe true
    }

    it("should detect not running in Synapse") {
      val config = new TestEnvConfig
      sys.props.remove("spark.cluster.type")
      config.isRunningInSynapse() shouldBe false
    }

    it("should detect not running in Fabric") {
      val config = new TestEnvConfig
      sys.props.remove("spark.cluster.type")
      config.isRunningInFabric() shouldBe false
    }

    it("should return Devcontainer runtime when LocalSpark is true") {
      val config = new TestEnvConfig
      config.runtime() shouldBe SparkRuntime.Devcontainer
    }

    it("should return Synapse runtime when not local and cluster type is synapse") {
      val config = new TestEnvConfig {
        override val LocalSpark: Boolean = false
      }
      sys.props("spark.cluster.type") = "synapse"
      try {
        config.runtime() shouldBe SparkRuntime.Synapse
      } finally {
        sys.props.remove("spark.cluster.type")
      }
    }

    it("should return Fabric runtime when not local and cluster type is trident") {
      val config = new TestEnvConfig {
        override val LocalSpark: Boolean = false
      }
      sys.props("spark.cluster.type") = "trident"
      try {
        config.runtime() shouldBe SparkRuntime.Fabric
      } finally {
        sys.props.remove("spark.cluster.type")
      }
    }

    it("should throw for unknown runtime") {
      val config = new TestEnvConfig {
        override val LocalSpark: Boolean = false
      }
      sys.props.remove("spark.cluster.type")
      an[IllegalStateException] should be thrownBy config.runtime()
    }
  }

  describe("SparkRuntime") {

    it("should have correct enum values") {
      SparkRuntime.Devcontainer.toString shouldBe "devcontainer"
      SparkRuntime.Synapse.toString shouldBe "synapse"
      SparkRuntime.Fabric.toString shouldBe "fabric"
    }
  }
}
