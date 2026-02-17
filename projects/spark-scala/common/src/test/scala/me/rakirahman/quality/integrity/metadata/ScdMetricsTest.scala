package me.rakirahman.quality.integrity.metadata

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class ScdMetricsTest extends AnyFunSpec with Matchers {

  describe("ScdMetrics") {

    it("should store all metrics correctly") {
      val metrics = ScdMetrics(
        numRowsCount = 100,
        distinctPrimaryKeyCount = 90,
        distinctNaturalKeyCount = 80,
        distinctEffectiveNaturalKeyCount = 75,
        endDateMaxButNotEffectiveRowCount = 5,
        endDateNotMaxButIsEffectiveRowCount = 3,
        multipleEffectiveNaturalKeyCount = 2,
        datesOutOfOrderNaturalKeyCount = 1
      )
      metrics.numRowsCount shouldBe 100
      metrics.distinctPrimaryKeyCount shouldBe 90
      metrics.distinctNaturalKeyCount shouldBe 80
      metrics.distinctEffectiveNaturalKeyCount shouldBe 75
      metrics.endDateMaxButNotEffectiveRowCount shouldBe 5
      metrics.endDateNotMaxButIsEffectiveRowCount shouldBe 3
      metrics.multipleEffectiveNaturalKeyCount shouldBe 2
      metrics.datesOutOfOrderNaturalKeyCount shouldBe 1
    }

    it("should support equality") {
      val a = ScdMetrics(1, 2, 3, 4, 5, 6, 7, 8)
      val b = ScdMetrics(1, 2, 3, 4, 5, 6, 7, 8)
      a shouldBe b
    }
  }
}
