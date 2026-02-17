package me.rakirahman.config

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class RuntimeAccessibleSystemPropertiesTest extends AnyFunSpec with Matchers {

  describe("RuntimeAccessibleSystemProperties") {

    it("should have correct property names") {
      RuntimeAccessibleSystemProperties.PropRandomStringPrefix shouldBe "RANDOM_STRING_PREFIX"
      RuntimeAccessibleSystemProperties.PropSbtTestName shouldBe "test.name"
    }
  }
}
