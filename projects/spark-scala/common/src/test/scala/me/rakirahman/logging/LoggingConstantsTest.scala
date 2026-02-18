package me.rakirahman.logging

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class LoggingConstantsTest extends AnyFunSpec with Matchers {

  describe("LoggingConstants") {

    it("should have correct divider formats") {
      LoggingConstants.mainDivider should include("=")
      LoggingConstants.mainDivider should have length 82 // \n + 80 chars + \n
      LoggingConstants.subDivider should include("─")
      LoggingConstants.sparseSubDivider should include("-")
    }
  }
}
