package me.rakirahman.quality.maintenance.handler

import me.rakirahman.etl.transformer.sorter.DateTypes
import me.rakirahman.quality.maintenance.metadata._
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class DeltaMaintenanceScriptGeneratorTest extends AnyFunSpec with Matchers {

  describe("DeltaMaintenanceScriptGenerator") {

    describe("findMatchingTables") {

      it("should match exact table name when isPrefix is false") {
        val tables = Array(("db1", "orders"), ("db1", "orders_archive"), ("db2", "orders"))
        val config = DesiredDeltaTableConfig("db1", "orders", isPrefix = false, Array.empty[String], "", null, Int.MaxValue, false, true, true)

        val result = DeltaMaintenanceScriptGenerator.findMatchingTables(tables, config)
        result should contain only (("db1", "orders"))
      }

      it("should match prefix when isPrefix is true") {
        val tables = Array(("db1", "silver_abc"), ("db1", "silver_def"), ("db1", "bronze_abc"))
        val config = DesiredDeltaTableConfig("db1", "silver_", isPrefix = true, Array.empty[String], "", null, Int.MaxValue, false, true, true)

        val result = DeltaMaintenanceScriptGenerator.findMatchingTables(tables, config)
        result.length shouldBe 2
        result should contain(("db1", "silver_abc"))
        result should contain(("db1", "silver_def"))
      }

      it("should match wildcard for entire database") {
        val tables = Array(("db1", "t1"), ("db1", "t2"), ("db2", "t3"))
        val config = DesiredDeltaTableConfig("db1", "*", isPrefix = true, Array.empty[String], "", null, Int.MaxValue, false, true, true)

        val result = DeltaMaintenanceScriptGenerator.findMatchingTables(tables, config)
        result.length shouldBe 2
      }

      it("should return empty when no matches") {
        val tables = Array(("db1", "orders"))
        val config = DesiredDeltaTableConfig("db2", "orders", isPrefix = false, Array.empty[String], "", null, Int.MaxValue, false, true, true)

        val result = DeltaMaintenanceScriptGenerator.findMatchingTables(tables, config)
        result shouldBe empty
      }
    }

    describe("generateMaintenanceScripts") {

      it("should generate VACUUM script when skipVacuum is false") {
        val tables = Array(("db1", "orders"))
        val configs = Array(
          DesiredDeltaTableConfig("db1", "orders", isPrefix = false, Array.empty[String], "", null, Int.MaxValue, false, true, true)
        )

        val result = DeltaMaintenanceScriptGenerator.generateMaintenanceScripts(tables, configs)
        result.length shouldBe 1
        result.head.scriptToRun should contain("VACUUM db1.orders RETAIN 168 HOURS;")
      }

      it("should generate OPTIMIZE script without ZORDER when zOrderColumns is empty") {
        val tables = Array(("db1", "orders"))
        val configs = Array(
          DesiredDeltaTableConfig("db1", "orders", isPrefix = false, Array.empty[String], "", null, Int.MaxValue, false, false, true)
        )

        val result = DeltaMaintenanceScriptGenerator.generateMaintenanceScripts(tables, configs)
        result.head.scriptToRun should contain("OPTIMIZE db1.orders;")
      }

      it("should generate OPTIMIZE with ZORDER when zOrderColumns is provided") {
        val tables = Array(("db1", "fct_sales"))
        val configs = Array(
          DesiredDeltaTableConfig("db1", "fct_sales", isPrefix = false, Array("salesorderid", "productid"), "", null, Int.MaxValue, false, false, true)
        )

        val result = DeltaMaintenanceScriptGenerator.generateMaintenanceScripts(tables, configs)
        result.head.scriptToRun should contain("OPTIMIZE db1.fct_sales ZORDER BY (salesorderid, productid);")
      }

      it("should generate both VACUUM and OPTIMIZE scripts") {
        val tables = Array(("db1", "dim_customer"))
        val configs = Array(
          DesiredDeltaTableConfig("db1", "dim_customer", isPrefix = false, Array("customer_key"), "", null, Int.MaxValue, false, false, true)
        )

        val result = DeltaMaintenanceScriptGenerator.generateMaintenanceScripts(tables, configs)
        result.head.scriptToRun.length shouldBe 2
        result.head.scriptToRun(0) shouldBe "VACUUM db1.dim_customer RETAIN 168 HOURS;"
        result.head.scriptToRun(1) shouldBe "OPTIMIZE db1.dim_customer ZORDER BY (customer_key);"
      }

      it("should skip tables when both skipVacuum and skipOptimize are true") {
        val tables = Array(("db1", "orders"))
        val configs = Array(
          DesiredDeltaTableConfig("db1", "orders", isPrefix = false, Array.empty[String], "", null, Int.MaxValue, true, true, true)
        )

        val result = DeltaMaintenanceScriptGenerator.generateMaintenanceScripts(tables, configs)
        result shouldBe empty
      }

      it("should not duplicate scripts for the same table") {
        val tables = Array(("db1", "silver_abc"))
        val configs = Array(
          DesiredDeltaTableConfig("db1", "silver_abc", isPrefix = false, Array.empty[String], "", null, Int.MaxValue, false, true, true),
          DesiredDeltaTableConfig("db1", "silver_", isPrefix = true, Array.empty[String], "", null, Int.MaxValue, false, true, true)
        )

        val result = DeltaMaintenanceScriptGenerator.generateMaintenanceScripts(tables, configs)
        result.length shouldBe 1
      }

      it("should handle multiple tables across databases") {
        val tables = Array(("db1", "t1"), ("db1", "t2"), ("db2", "t3"))
        val configs = Array(
          DesiredDeltaTableConfig("db1", "*", isPrefix = true, Array.empty[String], "", null, Int.MaxValue, false, true, true),
          DesiredDeltaTableConfig("db2", "t3", isPrefix = false, Array("col1"), "", null, Int.MaxValue, false, false, true)
        )

        val result = DeltaMaintenanceScriptGenerator.generateMaintenanceScripts(tables, configs)
        result.length shouldBe 3
      }
    }

    describe("findMissingTablesInDesiredConfig") {

      it("should return tables not covered by any config") {
        val tables = Array(("db1", "orders"), ("db1", "customers"), ("db1", "unknown"))
        val configs = Array(
          DesiredDeltaTableConfig("db1", "orders", isPrefix = false, Array.empty[String], "", null, Int.MaxValue, false, true, true),
          DesiredDeltaTableConfig("db1", "customers", isPrefix = false, Array.empty[String], "", null, Int.MaxValue, false, true, true)
        )

        val result = DeltaMaintenanceScriptGenerator.findMissingTablesInDesiredConfig(tables, configs)
        result should contain only (("db1", "unknown"))
      }

      it("should return empty when all tables are covered") {
        val tables = Array(("db1", "orders"), ("db1", "customers"))
        val configs = Array(
          DesiredDeltaTableConfig("db1", "*", isPrefix = true, Array.empty[String], "", null, Int.MaxValue, false, true, true)
        )

        val result = DeltaMaintenanceScriptGenerator.findMissingTablesInDesiredConfig(tables, configs)
        result shouldBe empty
      }

      it("should handle prefix matching for coverage") {
        val tables = Array(("db1", "silver_abc"), ("db1", "silver_def"), ("db1", "bronze_xyz"))
        val configs = Array(
          DesiredDeltaTableConfig("db1", "silver_", isPrefix = true, Array.empty[String], "", null, Int.MaxValue, false, true, true)
        )

        val result = DeltaMaintenanceScriptGenerator.findMissingTablesInDesiredConfig(tables, configs)
        result should contain only (("db1", "bronze_xyz"))
      }

      it("should return empty for empty input") {
        val result = DeltaMaintenanceScriptGenerator.findMissingTablesInDesiredConfig(
          Array.empty,
          Array.empty
        )
        result shouldBe empty
      }

      it("should not report tables in databases with wildcard coverage") {
        val tables = Array(("db1", "any_table"), ("db1", "another_table"))
        val configs = Array(
          DesiredDeltaTableConfig("db1", "*", isPrefix = true, Array.empty[String], "", null, Int.MaxValue, false, true, true)
        )

        val result = DeltaMaintenanceScriptGenerator.findMissingTablesInDesiredConfig(tables, configs)
        result shouldBe empty
      }
    }
  }
}
