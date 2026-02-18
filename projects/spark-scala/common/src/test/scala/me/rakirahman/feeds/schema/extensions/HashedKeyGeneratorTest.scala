package me.rakirahman.feeds.schema.extensions

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class HashedKeyGeneratorTest extends AnyFunSpec with Matchers {

  object TestGenerator extends HashedKeyGenerator

  describe("HashedKeyGenerator") {

    it("should generate a SHA2 hash expression") {
      val result = TestGenerator.toUniqueHash(Array("col1", "col2"))
      result shouldBe "SHA2(concat_ws('|', col1, col2), 512)"
    }

    it("should sort columns alphabetically") {
      val result = TestGenerator.toUniqueHash(Array("z_col", "a_col"))
      result shouldBe "SHA2(concat_ws('|', a_col, z_col), 512)"
    }

    it("should deduplicate columns by default") {
      val result = TestGenerator.toUniqueHash(Array("col1", "col1", "col2"))
      result shouldBe "SHA2(concat_ws('|', col1, col2), 512)"
    }

    it("should not deduplicate when distinct is false") {
      val result = TestGenerator.toUniqueHash(Array("col1", "col1"), distinct = false)
      result shouldBe "SHA2(concat_ws('|', col1, col1), 512)"
    }

    it("should handle single column") {
      val result = TestGenerator.toUniqueHash(Array("only_col"))
      result shouldBe "SHA2(concat_ws('|', only_col), 512)"
    }
  }
}
