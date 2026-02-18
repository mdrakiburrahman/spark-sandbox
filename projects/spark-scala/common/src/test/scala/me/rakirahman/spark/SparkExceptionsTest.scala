package me.rakirahman.spark

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class SparkExceptionsTest extends AnyFunSpec with Matchers {

  describe("SparkExceptions") {

    it("should have correct exception constants") {
      SparkExceptions.EXCEPTION_DELTA_METADATA_CHANGED shouldBe "DELTA_METADATA_CHANGED"
      SparkExceptions.EXCEPTION_DELTA_PROTOCOL_CHANGED shouldBe "DELTA_PROTOCOL_CHANGED"
      SparkExceptions.EXCEPTION_HIVE_TABLE_ALREADY_EXISTS shouldBe "AlreadyExistsException"
      SparkExceptions.EXCEPTION_DELTA_NON_EMPTY_LOCATION shouldBe "DELTA_CREATE_TABLE_WITH_NON_EMPTY_LOCATION"
    }

    it("should have correct default retry patterns") {
      SparkExceptions.DefaultDeltaRetryPatterns should have length 4
      SparkExceptions.DefaultDeltaRetryPatterns should contain(SparkExceptions.EXCEPTION_DELTA_METADATA_CHANGED)
      SparkExceptions.DefaultDeltaRetryPatterns should contain(SparkExceptions.EXCEPTION_DELTA_PROTOCOL_CHANGED)
      SparkExceptions.DefaultDeltaRetryPatterns should contain(SparkExceptions.EXCEPTION_HIVE_TABLE_ALREADY_EXISTS)
      SparkExceptions.DefaultDeltaRetryPatterns should contain(SparkExceptions.EXCEPTION_DELTA_NON_EMPTY_LOCATION)
    }
  }
}
