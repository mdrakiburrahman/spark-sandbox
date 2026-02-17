package me.rakirahman.etl.loader.scd

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class SCDTableMetadataTest extends AnyFunSpec with Matchers {

  describe("SCDTableMetadata") {

    it("should have empty default maps for predicates and integrity") {
      val meta = new SCDTableMetadata[String, String, String, String, String] {
        override val destinationTableToSchemaMap: Map[String, String] = Map.empty
        override val parallelizableDimTables: Seq[String] = Seq.empty
        override val nonParallelizableDimTables: Seq[String] = Seq.empty
        override val tableDataQualityValidations: Map[String, String => Seq[String]] = Map.empty
      }
      meta.tablePredicateMap shouldBe empty
      meta.tableFactIntegrityMap shouldBe empty
    }
  }
}
