package me.rakirahman.etl.driver

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class DriverOptsTest extends AnyFunSpec with Matchers {

  describe("DriverOpts") {

    it("should validate when isValid returns true") {
      val opts = new DriverOpts {
        override def isValid: Boolean = true
      }
      noException should be thrownBy opts.validate
    }

    it("should throw AssertionError when isValid returns false") {
      val opts = new DriverOpts {
        override def isValid: Boolean = false
      }
      an[AssertionError] should be thrownBy opts.validate
    }
  }
}
