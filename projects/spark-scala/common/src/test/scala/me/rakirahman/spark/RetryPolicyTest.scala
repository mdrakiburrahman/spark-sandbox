package me.rakirahman.spark

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class RetryPolicyTest extends AnyFunSpec with Matchers {

  describe("RetryPolicy") {

    it("should succeed on first attempt when no error") {
      val policy = RetryPolicy(Array("SomeError".r), maxAttempts = 3)
      val result = policy.execute { 42 }
      result shouldBe 42
    }

    it("should retry on matching pattern and succeed") {
      var attempts = 0
      val policy = RetryPolicy(Array("Retryable".r), maxAttempts = 3)
      val result = policy.execute {
        attempts += 1
        if (attempts < 2) throw new RuntimeException("Retryable error occurred")
        "success"
      }
      result shouldBe "success"
      attempts shouldBe 2
    }

    it("should throw after max attempts exhausted") {
      var attempts = 0
      val policy = RetryPolicy(Array("Retryable".r), maxAttempts = 2)
      an[RuntimeException] should be thrownBy {
        policy.execute {
          attempts += 1
          throw new RuntimeException("Retryable error")
        }
      }
      attempts shouldBe 2
    }

    it("should not retry on non-matching pattern") {
      var attempts = 0
      val policy = RetryPolicy(Array("Retryable".r), maxAttempts = 3)
      an[RuntimeException] should be thrownBy {
        policy.execute {
          attempts += 1
          throw new RuntimeException("Non-matching error")
        }
      }
      attempts shouldBe 1
    }

    it("should match patterns in exception cause chain") {
      var attempts = 0
      val policy = RetryPolicy(Array("CauseError".r), maxAttempts = 3)
      val result = policy.execute {
        attempts += 1
        if (attempts < 2) {
          val cause = new RuntimeException("CauseError happened")
          throw new RuntimeException("wrapper", cause)
        }
        "done"
      }
      result shouldBe "done"
      attempts shouldBe 2
    }

    it("should match patterns against class name") {
      var attempts = 0
      val policy = RetryPolicy(Array("IllegalArgument".r), maxAttempts = 3)
      val result = policy.execute {
        attempts += 1
        if (attempts < 2) throw new IllegalArgumentException("some message")
        "ok"
      }
      result shouldBe "ok"
    }

    it("should have correct default max attempts") {
      RetryPolicy.DefaultMaxAttempts shouldBe 5
    }

    it("should create DeltaConflicts policy with correct patterns") {
      val policy = RetryPolicy.DeltaConflicts
      policy.maxAttempts shouldBe RetryPolicy.DefaultMaxAttempts
      policy.patterns should have length 4
    }
  }
}
