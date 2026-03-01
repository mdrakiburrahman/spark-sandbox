package me.rakirahman.quality.maintenance.metadata

import me.rakirahman.etl.transformer.sorter.DateTypes
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class DeltaVacuumConfigsExtensionsTest extends AnyFunSpec with Matchers {

  import DeltaVacuumConfigsExtensions._

  describe("DeltaVacuumConfigsValidator") {

    it("should validate a valid metadata with purge enabled") {
      val metadata = new DeltaVacuumMetadata {
        val desiredDeltaTableConfigs: Array[DesiredDeltaTableConfig] = Array(
          DesiredDeltaTableConfig(
            database = "test_db",
            tableNameOrPrefix = "test_table",
            isPrefix = false,
            zOrderColumns = Array.empty[String],
            purgePartitionColumn = "event_year_date",
            purgePartitionColumnDateType = DateTypes.YearMonthDate,
            numPartitionsToRetain = 30,
            skipVacuum = false,
            skipOptimize = false,
            skipPurge = false
          )
        )
      }
      metadata.isValid() shouldBe true
    }

    it("should validate a valid metadata with purge skipped") {
      val metadata = new DeltaVacuumMetadata {
        val desiredDeltaTableConfigs: Array[DesiredDeltaTableConfig] = Array(
          DesiredDeltaTableConfig(
            database = "test_db",
            tableNameOrPrefix = "test_table",
            isPrefix = false,
            zOrderColumns = Array.empty[String],
            purgePartitionColumn = "",
            purgePartitionColumnDateType = null,
            numPartitionsToRetain = Int.MaxValue,
            skipVacuum = false,
            skipOptimize = true,
            skipPurge = true
          )
        )
      }
      metadata.isValid() shouldBe true
    }

    it("should invalidate when purge enabled but partition column is empty") {
      val metadata = new DeltaVacuumMetadata {
        val desiredDeltaTableConfigs: Array[DesiredDeltaTableConfig] = Array(
          DesiredDeltaTableConfig(
            database = "test_db",
            tableNameOrPrefix = "test_table",
            isPrefix = false,
            zOrderColumns = Array.empty[String],
            purgePartitionColumn = "",
            purgePartitionColumnDateType = DateTypes.YearMonthDate,
            numPartitionsToRetain = 30,
            skipVacuum = false,
            skipOptimize = false,
            skipPurge = false
          )
        )
      }
      metadata.isValid() shouldBe false
    }

    it("should invalidate when purge enabled but date type is null") {
      val metadata = new DeltaVacuumMetadata {
        val desiredDeltaTableConfigs: Array[DesiredDeltaTableConfig] = Array(
          DesiredDeltaTableConfig(
            database = "test_db",
            tableNameOrPrefix = "test_table",
            isPrefix = false,
            zOrderColumns = Array.empty[String],
            purgePartitionColumn = "event_year_date",
            purgePartitionColumnDateType = null,
            numPartitionsToRetain = 30,
            skipVacuum = false,
            skipOptimize = false,
            skipPurge = false
          )
        )
      }
      metadata.isValid() shouldBe false
    }

    it("should invalidate when numPartitionsToRetain is zero") {
      val metadata = new DeltaVacuumMetadata {
        val desiredDeltaTableConfigs: Array[DesiredDeltaTableConfig] = Array(
          DesiredDeltaTableConfig(
            database = "test_db",
            tableNameOrPrefix = "test_table",
            isPrefix = false,
            zOrderColumns = Array.empty[String],
            purgePartitionColumn = "",
            purgePartitionColumnDateType = null,
            numPartitionsToRetain = 0,
            skipVacuum = false,
            skipOptimize = false,
            skipPurge = true
          )
        )
      }
      metadata.isValid() shouldBe false
    }

    it("should validate an empty configs array") {
      val metadata = new DeltaVacuumMetadata {
        val desiredDeltaTableConfigs: Array[DesiredDeltaTableConfig] = Array.empty
      }
      metadata.isValid() shouldBe true
    }

    it("should validate multiple valid configs") {
      val metadata = new DeltaVacuumMetadata {
        val desiredDeltaTableConfigs: Array[DesiredDeltaTableConfig] = Array(
          DesiredDeltaTableConfig("db1", "t1", false, Array.empty[String], "event_year_date", DateTypes.YearMonthDate, 30, false, false, false),
          DesiredDeltaTableConfig("db2", "t2", true, Array("col1"), "", null, Int.MaxValue, false, true, true)
        )
      }
      metadata.isValid() shouldBe true
    }

    it("should invalidate if any config in array is invalid") {
      val metadata = new DeltaVacuumMetadata {
        val desiredDeltaTableConfigs: Array[DesiredDeltaTableConfig] = Array(
          DesiredDeltaTableConfig("db1", "t1", false, Array.empty[String], "event_year_date", DateTypes.YearMonthDate, 30, false, false, false),
          DesiredDeltaTableConfig("db2", "t2", false, Array.empty[String], "", null, 30, false, false, false)
        )
      }
      metadata.isValid() shouldBe false
    }
  }
}
