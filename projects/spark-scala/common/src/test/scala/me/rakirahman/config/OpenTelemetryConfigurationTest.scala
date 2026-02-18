package me.rakirahman.config

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class OpenTelemetryConfigurationTest extends AnyFunSpec with Matchers {

  describe("OpenTelemetryConfiguration") {

    it("should have correct default values") {
      val config = OpenTelemetryConfiguration()
      config.url shouldBe ""
      config.audience shouldBe ""
      config.isRelay shouldBe false
    }

    it("should accept custom values") {
      val config = OpenTelemetryConfiguration(
        url = "https://example.com",
        audience = "my-audience",
        isRelay = true
      )
      config.url shouldBe "https://example.com"
      config.audience shouldBe "my-audience"
      config.isRelay shouldBe true
    }

    it("should support equality") {
      OpenTelemetryConfiguration() shouldBe OpenTelemetryConfiguration()
      OpenTelemetryConfiguration("a", "b", true) shouldBe OpenTelemetryConfiguration("a", "b", true)
      OpenTelemetryConfiguration("a") should not be OpenTelemetryConfiguration("b")
    }
  }
}
