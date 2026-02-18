package me.rakirahman.feeds.schema

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class StarSchemaConstantsTest extends AnyFunSpec with Matchers {

  describe("StarSchemaTableTypes") {

    it("should have correct enum values") {
      StarSchemaTableTypes.Fact.toString shouldBe "fact"
      StarSchemaTableTypes.Dimension.toString shouldBe "dimension"
      StarSchemaTableTypes.Seed.toString shouldBe "seed"
    }

    it("should have correct number of values") {
      StarSchemaTableTypes.values should have size 3
    }
  }

  describe("StarSchemaLoaderConstants") {

    it("should have correct columns list") {
      StarSchemaLoaderConstants.columnsHydratedInStarSchemaNotInStaging shouldBe Array("is_row_effective", "row_effective_end")
    }
  }
}
