package me.rakirahman.etl.transformer.scd

import me.rakirahman.etl.transformer.scd.SCDTransformationMetadata._
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class SCDTransformationMetadataTest extends AnyFunSpec with Matchers {

  describe("KeyGenInfo") {

    it("should store all fields correctly") {
      val info = KeyGenInfo("sk_col", "nk_col", "SHA2(concat_ws('|', nk_col), 512)")
      info.surrogateKeyCol shouldBe "sk_col"
      info.naturalKeyCol shouldBe "nk_col"
      info.surrogateKeyHashLogic should include("SHA2")
    }
  }

  describe("SCDTransformationInfo") {

    it("should store all fields correctly") {
      val info = SCDTransformationInfo(
        primaryKeyCol = "pk",
        matchStatement = "updates.col <> destination.col",
        nonSCDColumns = Array("col1", "col2"),
        fullColumnsUpsertMap = Map("col1" -> "updates.col1")
      )
      info.primaryKeyCol shouldBe "pk"
      info.nonSCDColumns should have length 2
      info.fullColumnsUpsertMap("col1") shouldBe "updates.col1"
    }
  }

  describe("NonSCDTransformationInfo") {

    it("should store all columns") {
      val info = NonSCDTransformationInfo(allColumns = Array("a", "b", "c"))
      info.allColumns should have length 3
    }
  }
}
