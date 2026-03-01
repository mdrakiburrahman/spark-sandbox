package me.rakirahman.quality.maintenance.metadata

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class DeltaVacuumMetadataTest extends AnyFunSpec with Matchers {

  describe("DeltaVacuumMetadata") {

    it("should allow implementing a concrete metadata object") {
      val metadata = new DeltaVacuumMetadata {
        val desiredDeltaTableConfigs: Array[DesiredDeltaTableConfig] = Array(
          DesiredDeltaTableConfig("db", "table", false, Array.empty[String], "", null, Int.MaxValue, false, false, true)
        )
      }
      metadata.desiredDeltaTableConfigs.length shouldBe 1
      metadata.desiredDeltaTableConfigs(0).database shouldBe "db"
    }

    it("should support empty configs") {
      val metadata = new DeltaVacuumMetadata {
        val desiredDeltaTableConfigs: Array[DesiredDeltaTableConfig] = Array.empty
      }
      metadata.desiredDeltaTableConfigs shouldBe empty
    }
  }
}
