package me.rakirahman.etl.transformer.extensions

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class QueryExtensionsTest extends AnyFunSpec with Matchers {
  import QueryExtensions._

  describe("QueryExtensions") {

    it("should transform <> to null-safe <=> comparisons") {
      val query = "updates.col1 <> destination.col1"
      query.withNullEqualityApplied() shouldBe "NOT (updates.col1 <=> destination.col1)"
    }

    it("should transform multiple <> comparisons") {
      val query = "updates.col1 <> destination.col1 OR updates.col2 <> destination.col2"
      val result = query.withNullEqualityApplied()
      result shouldBe "NOT (updates.col1 <=> destination.col1) OR NOT (updates.col2 <=> destination.col2)"
    }

    it("should leave queries without <> unchanged") {
      val query = "updates.col1 = destination.col1"
      query.withNullEqualityApplied() shouldBe "updates.col1 = destination.col1"
    }

    it("should handle empty strings") {
      "".withNullEqualityApplied() shouldBe ""
    }
  }
}
