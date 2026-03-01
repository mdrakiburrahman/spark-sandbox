package me.rakirahman.quality.maintenance.metadata

import me.rakirahman.etl.transformer.sorter.DateTypes
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class DeltaMaintenanceModelsTest extends AnyFunSpec with Matchers {

  describe("DeltaMaintenanceScripts") {

    it("should store all properties correctly") {
      val scripts = DeltaMaintenanceScripts(
        databaseName = "test_db",
        tableName = "test_table",
        scriptToRun = Array("VACUUM test_db.test_table;", "OPTIMIZE test_db.test_table;")
      )
      scripts.databaseName shouldBe "test_db"
      scripts.tableName shouldBe "test_table"
      scripts.scriptToRun.length shouldBe 2
      scripts.scriptToRun(0) shouldBe "VACUUM test_db.test_table;"
      scripts.scriptToRun(1) shouldBe "OPTIMIZE test_db.test_table;"
    }

    it("should support empty script array") {
      val scripts = DeltaMaintenanceScripts("db", "table", Array.empty[String])
      scripts.scriptToRun shouldBe empty
    }
  }

  describe("DesiredDeltaTableConfig") {

    it("should store all properties for a table with VACUUM + OPTIMIZE + ZORDER") {
      val config = DesiredDeltaTableConfig(
        database = "arc_sql_db_bi",
        tableNameOrPrefix = "arm_collection_dim",
        isPrefix = false,
        zOrderColumns = Array("arm_id", "arm_collection_key"),
        purgePartitionColumn = "",
        purgePartitionColumnDateType = null,
        numPartitionsToRetain = Int.MaxValue,
        skipVacuum = false,
        skipOptimize = false,
        skipPurge = true
      )
      config.database shouldBe "arc_sql_db_bi"
      config.tableNameOrPrefix shouldBe "arm_collection_dim"
      config.isPrefix shouldBe false
      config.zOrderColumns should contain allOf ("arm_id", "arm_collection_key")
      config.skipVacuum shouldBe false
      config.skipOptimize shouldBe false
      config.skipPurge shouldBe true
      config.numPartitionsToRetain shouldBe Int.MaxValue
    }

    it("should store all properties for a prefix-matched table") {
      val config = DesiredDeltaTableConfig(
        database = "data_ops_inventory_db",
        tableNameOrPrefix = "arcdatasynapsedogfood_",
        isPrefix = true,
        zOrderColumns = Array.empty[String],
        purgePartitionColumn = "YearMonthDate",
        purgePartitionColumnDateType = DateTypes.YearMonthDate,
        numPartitionsToRetain = 7,
        skipVacuum = false,
        skipOptimize = true,
        skipPurge = false
      )
      config.isPrefix shouldBe true
      config.zOrderColumns shouldBe empty
      config.purgePartitionColumn shouldBe "YearMonthDate"
      config.purgePartitionColumnDateType shouldBe DateTypes.YearMonthDate
      config.numPartitionsToRetain shouldBe 7
    }

    it("should support wildcard prefix for entire database") {
      val config = DesiredDeltaTableConfig(
        database = "dbt_adventureworks_seed",
        tableNameOrPrefix = "*",
        isPrefix = true,
        zOrderColumns = Array.empty[String],
        purgePartitionColumn = "",
        purgePartitionColumnDateType = null,
        numPartitionsToRetain = Int.MaxValue,
        skipVacuum = false,
        skipOptimize = true,
        skipPurge = true
      )
      config.tableNameOrPrefix shouldBe "*"
    }

    it("should support equality comparison") {
      val a = DesiredDeltaTableConfig("db", "table", false, Array.empty[String], "", null, Int.MaxValue, false, false, true)
      val b = DesiredDeltaTableConfig("db", "table", false, Array.empty[String], "", null, Int.MaxValue, false, false, true)
      a shouldBe b
    }
  }
}
