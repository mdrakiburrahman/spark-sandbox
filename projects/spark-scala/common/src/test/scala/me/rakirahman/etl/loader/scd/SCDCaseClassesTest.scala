package me.rakirahman.etl.loader.scd

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class SCDCaseClassesTest extends AnyFunSpec with Matchers {

  describe("SCDTableDriverConfig") {

    it("should store partitions and schema") {
      val config = SCDTableDriverConfig(
        partitions = Array("year", "month"),
        schema = Array(("id", "INT"), ("name", "STRING"))
      )
      config.partitions shouldBe Array("year", "month")
      config.schema should have length 2
    }
  }

  describe("SCDTablePredicateConfig") {

    it("should store columns to keep and predicate columns") {
      val config = SCDTablePredicateConfig(
        columnsToKeep = Array("id", "name"),
        predicateColumnNames = Array("year")
      )
      config.columnsToKeep shouldBe Array("id", "name")
      config.predicateColumnNames shouldBe Array("year")
    }
  }

  describe("SCDFactIntegrityConfig") {

    it("should store dimension tables") {
      val config = SCDFactIntegrityConfig(dimensionTables = Array("dim_customer", "dim_product"))
      config.dimensionTables should have length 2
    }
  }

  describe("SCDFactIntegrityViews") {

    it("should store fact view and dim view map") {
      val views = SCDFactIntegrityViews(
        factView = "fact_view",
        dimViewMap = Map("dim1" -> "dim1_view")
      )
      views.factView shouldBe "fact_view"
      views.dimViewMap("dim1") shouldBe "dim1_view"
    }
  }
}
