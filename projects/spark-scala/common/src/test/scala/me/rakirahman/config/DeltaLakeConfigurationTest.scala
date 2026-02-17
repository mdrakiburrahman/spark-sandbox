package me.rakirahman.config

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class DeltaLakeConfigurationTest extends AnyFunSpec with Matchers {

  describe("DeltaLakeConfiguration") {

    it("should have correct constant values") {
      DeltaLakeConfiguration.DELTA_LOG shouldBe "_delta_log"
      DeltaLakeConfiguration.FIRST_COMMIT shouldBe "00000000000000000000.json"
      DeltaLakeConfiguration.DELTA_CONF_SKIP_CHANGE_COMMITS shouldBe "skipChangeCommits"
      DeltaLakeConfiguration.DELTA_CONF_ENABLE_DELETION_VECTORS shouldBe "delta.enableDeletionVectors"
      DeltaLakeConfiguration.DELTA_CONF_OPTIMIZE_WRITE shouldBe "delta.autoOptimize.optimizeWrite"
      DeltaLakeConfiguration.DELTA_CONF_AUTO_COMPACT shouldBe "delta.autoOptimize.autoCompact"
      DeltaLakeConfiguration.DELTA_TARGET_FILE_SIZE shouldBe "delta.targetFileSize"
      DeltaLakeConfiguration.DELTA_APPEND_ONLY shouldBe "delta.appendOnly"
      DeltaLakeConfiguration.DELTA_CONF_CDC shouldBe "delta.enableChangeDataFeed"
      DeltaLakeConfiguration.DELTA_VERSION shouldBe "version"
    }
  }
}
