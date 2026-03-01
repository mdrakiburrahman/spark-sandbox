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

    it("should have Fabric optimize configs with expected keys") {
      val configs = DeltaLakeConfiguration.FABRIC_OPTIMIZE_CONFIGS
      configs should not be empty
      configs should contain key "spark.databricks.delta.optimize.maxThreads"
      configs should contain key "spark.databricks.delta.optimize.repartition.enabled"
      configs should contain key "spark.databricks.delta.optimize.zorder.fastInterleaveBits.enabled"
      configs should contain key "spark.databricks.delta.optimize.zorder.checkStatsCollection.enabled"
      configs should contain key "spark.databricks.io.skipping.mdc.addNoise"
      configs should contain key "spark.microsoft.delta.parquet.vorder.fast.optimize.enabled"
      configs should contain key "spark.microsoft.delta.parallelSnapshotLoading.enabled"
      configs should contain key "spark.microsoft.delta.parallelSnapshotLoading.threadPoolSize"
      configs should contain key "spark.databricks.delta.collectStats.useMultiThreadedStatsCollection"
      configs should contain key "spark.databricks.delta.collectStats.numFilesPerPartition"
      configs should contain key "spark.databricks.delta.vacuum.parallelDelete.enabled"
      configs should contain key "spark.databricks.delta.vacuum.parallelDelete.parallelism"
      configs should contain key "spark.databricks.delta.retentionDurationCheck.enabled"
      configs should contain key "spark.databricks.delta.snapshotPartitions"
    }

    it("should have exactly 14 Fabric optimize configs") {
      DeltaLakeConfiguration.FABRIC_OPTIMIZE_CONFIGS.size shouldBe 14
    }

    it("should have correct Fabric optimize config values") {
      val configs = DeltaLakeConfiguration.FABRIC_OPTIMIZE_CONFIGS
      configs("spark.databricks.delta.optimize.maxThreads") shouldBe "256"
      configs("spark.databricks.delta.vacuum.parallelDelete.enabled") shouldBe "true"
      configs("spark.databricks.delta.vacuum.parallelDelete.parallelism") shouldBe "128"
      configs("spark.databricks.delta.retentionDurationCheck.enabled") shouldBe "false"
      configs("spark.databricks.delta.snapshotPartitions") shouldBe "128"
    }
  }
}
