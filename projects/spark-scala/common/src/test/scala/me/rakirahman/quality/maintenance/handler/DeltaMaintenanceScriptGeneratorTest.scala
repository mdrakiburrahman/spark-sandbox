package me.rakirahman.quality.maintenance.handler

import java.sql.Timestamp
import me.rakirahman.etl.transformer.sorter.{DateTypes, SortableColumnNames}
import me.rakirahman.metastore.PartitionOperations
import me.rakirahman.quality.maintenance.metadata._
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

/** Stub implementation of [[PartitionOperations]] for unit testing purge script generation.
  */
class StubPartitionOperations(partitionValues: Map[(String, String, String), Array[String]]) extends PartitionOperations {
  override def getPartitions(databaseName: String, tableName: String): Array[String] = Array.empty
  override def getDistinctPartitionValues(databaseName: String, tableName: String, partition: String): Array[String] = partitionValues.getOrElse((databaseName, tableName, partition), Array.empty)
  override def getTimestampPartitionValues(databaseName: String, tableName: String, partition: String, columnName: SortableColumnNames.Types): Array[Timestamp] = Array.empty
  override def getMinMaxTimestampPartitionValues(databaseName: String, tableName: String, partition: String, columnName: SortableColumnNames.Types): (Timestamp, Timestamp) = (null, null)
}

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

      it("should generate PURGE DELETE script retaining only the N most recent partitions") {
        val partitionValues = Map(
          ("db1", "fct_commits", "date_key") -> Array("20250101", "20250102", "20250103", "20250104", "20250105")
        )
        val stubOps = new StubPartitionOperations(partitionValues)
        val tables = Array(("db1", "fct_commits"))
        val configs = Array(
          DesiredDeltaTableConfig("db1", "fct_commits", isPrefix = false, Array.empty[String], "date_key", DateTypes.YearMonthDate, 2, true, true, false)
        )

        val result = DeltaMaintenanceScriptGenerator.generateMaintenanceScripts(tables, configs, Some(stubOps))
        result.length shouldBe 1
        result.head.scriptToRun.length shouldBe 1
        result.head.scriptToRun(0) shouldBe "DELETE FROM db1.fct_commits WHERE date_key NOT IN ('20250104', '20250105')"
      }

      it("should generate PURGE DELETE script with YearMonth partitions") {
        val partitionValues = Map(
          ("db1", "events", "event_year_month") -> Array("202407", "202408", "202409", "202410", "202411", "202412")
        )
        val stubOps = new StubPartitionOperations(partitionValues)
        val tables = Array(("db1", "events"))
        val configs = Array(
          DesiredDeltaTableConfig("db1", "events", isPrefix = false, Array.empty[String], "event_year_month", DateTypes.YearMonth, 3, true, true, false)
        )

        val result = DeltaMaintenanceScriptGenerator.generateMaintenanceScripts(tables, configs, Some(stubOps))
        result.length shouldBe 1
        result.head.scriptToRun(0) shouldBe "DELETE FROM db1.events WHERE event_year_month NOT IN ('202410', '202411', '202412')"
      }

      it("should not generate PURGE when partition count is within retention") {
        val partitionValues = Map(
          ("db1", "small_table", "date_key") -> Array("20250101", "20250102")
        )
        val stubOps = new StubPartitionOperations(partitionValues)
        val tables = Array(("db1", "small_table"))
        val configs = Array(
          DesiredDeltaTableConfig("db1", "small_table", isPrefix = false, Array.empty[String], "date_key", DateTypes.YearMonthDate, 7, true, true, false)
        )

        val result = DeltaMaintenanceScriptGenerator.generateMaintenanceScripts(tables, configs, Some(stubOps))
        result shouldBe empty
      }

      it("should skip PURGE when skipPurge is true even with partitionOps provided") {
        val partitionValues = Map(
          ("db1", "dim_table", "date_key") -> Array("20250101", "20250102", "20250103", "20250104", "20250105")
        )
        val stubOps = new StubPartitionOperations(partitionValues)
        val tables = Array(("db1", "dim_table"))
        val configs = Array(
          DesiredDeltaTableConfig("db1", "dim_table", isPrefix = false, Array.empty[String], "", null, Int.MaxValue, false, true, true)
        )

        val result = DeltaMaintenanceScriptGenerator.generateMaintenanceScripts(tables, configs, Some(stubOps))
        result.head.scriptToRun.foreach { s => s should not include ("DELETE") }
      }

      it("should generate PURGE before VACUUM and OPTIMIZE when all enabled") {
        val partitionValues = Map(
          ("db1", "fct_health", "date_key") -> Array("20250101", "20250102", "20250103", "20250104", "20250105")
        )
        val stubOps = new StubPartitionOperations(partitionValues)
        val tables = Array(("db1", "fct_health"))
        val configs = Array(
          DesiredDeltaTableConfig("db1", "fct_health", isPrefix = false, Array("table_key", "date_key"), "date_key", DateTypes.YearMonthDate, 2, false, false, false)
        )

        val result = DeltaMaintenanceScriptGenerator.generateMaintenanceScripts(tables, configs, Some(stubOps))
        result.head.scriptToRun.length shouldBe 3
        result.head.scriptToRun(0) shouldBe "DELETE FROM db1.fct_health WHERE date_key NOT IN ('20250104', '20250105')"
        result.head.scriptToRun(1) shouldBe "VACUUM db1.fct_health RETAIN 168 HOURS;"
        result.head.scriptToRun(2) shouldBe "OPTIMIZE db1.fct_health ZORDER BY (table_key, date_key);"
      }

      it("should not generate PURGE when partitionOps is None") {
        val tables = Array(("db1", "fct_commits"))
        val configs = Array(
          DesiredDeltaTableConfig("db1", "fct_commits", isPrefix = false, Array.empty[String], "date_key", DateTypes.YearMonthDate, 2, false, true, false)
        )

        val result = DeltaMaintenanceScriptGenerator.generateMaintenanceScripts(tables, configs, None)
        result.head.scriptToRun.length shouldBe 1
        result.head.scriptToRun(0) shouldBe "VACUUM db1.fct_commits RETAIN 168 HOURS;"
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
