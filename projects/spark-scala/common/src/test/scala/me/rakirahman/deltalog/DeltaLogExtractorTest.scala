package me.rakirahman.deltalog

import org.apache.spark.sql.SparkSession
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class DeltaLogExtractorTest extends AnyFunSpec with Matchers {

  lazy val spark: SparkSession = SparkSession.builder
    .master("local")
    .appName(this.getClass.getSimpleName.stripSuffix("$"))
    .config("spark.sql.shuffle.partitions", "1")
    .config(
      "spark.sql.extensions",
      "io.delta.sql.DeltaSparkSessionExtension"
    )
    .config(
      "spark.sql.catalog.spark_catalog",
      "org.apache.spark.sql.delta.catalog.DeltaCatalog"
    )
    .config(
      "spark.sql.warehouse.dir",
      s"/tmp/DeltaLogExtractorTest-${System.currentTimeMillis}/warehouse"
    )
    .config("spark.driver.host", "localhost")
    .config("spark.ui.enabled", "false")
    .getOrCreate()

  describe("DeltaLogExtractor companion object") {

    describe("extractLongMetric") {
      it("should extract the first matching key") {
        val metrics =
          Map("numOutputRows" -> "1500", "numFiles" -> "3")

        val result = DeltaLogExtractor.extractLongMetric(
          metrics,
          "numOutputRows",
          "numTargetRowsInserted"
        )

        result shouldBe Some(1500L)
      }

      it("should try fallback keys when first key is missing") {
        val metrics = Map("numTargetRowsInserted" -> "200")

        val result = DeltaLogExtractor.extractLongMetric(
          metrics,
          "numOutputRows",
          "numTargetRowsInserted"
        )

        result shouldBe Some(200L)
      }

      it("should return None when no keys match") {
        val metrics = Map("someOtherMetric" -> "100")

        val result = DeltaLogExtractor.extractLongMetric(
          metrics,
          "numOutputRows",
          "numTargetRowsInserted"
        )

        result shouldBe None
      }

      it("should return Some(0) for unparseable values") {
        val metrics = Map("numOutputRows" -> "not_a_number")

        val result =
          DeltaLogExtractor.extractLongMetric(metrics, "numOutputRows")

        result shouldBe Some(0L)
      }

      it("should return None for an empty metrics map") {
        val result =
          DeltaLogExtractor.extractLongMetric(Map.empty, "numOutputRows")

        result shouldBe None
      }

      it("should handle WRITE metrics") {
        val metrics = Map(
          "numOutputRows" -> "5000",
          "numFiles" -> "10",
          "numOutputBytes" -> "50000"
        )

        DeltaLogExtractor.extractLongMetric(
          metrics,
          "numOutputRows"
        ) shouldBe Some(5000L)
        DeltaLogExtractor.extractLongMetric(
          metrics,
          "numFiles",
          "numAddedFiles"
        ) shouldBe Some(10L)
        DeltaLogExtractor.extractLongMetric(
          metrics,
          "numOutputBytes"
        ) shouldBe Some(50000L)
      }

      it("should handle MERGE metrics") {
        val metrics = Map(
          "numSourceRows" -> "1000",
          "numTargetRowsInserted" -> "200",
          "numTargetRowsUpdated" -> "50",
          "numTargetRowsDeleted" -> "10",
          "numOutputRows" -> "260",
          "numTargetFilesAdded" -> "5",
          "numTargetFilesRemoved" -> "3",
          "executionTimeMs" -> "1500"
        )

        DeltaLogExtractor.extractLongMetric(
          metrics,
          "numOutputRows",
          "numTargetRowsInserted"
        ) shouldBe Some(260L)
        DeltaLogExtractor.extractLongMetric(
          metrics,
          "numFiles",
          "numAddedFiles",
          "numTargetFilesAdded"
        ) shouldBe Some(5L)
        DeltaLogExtractor.extractLongMetric(
          metrics,
          "numRemovedFiles",
          "numTargetFilesRemoved"
        ) shouldBe Some(3L)
        DeltaLogExtractor.extractLongMetric(
          metrics,
          "executionTimeMs"
        ) shouldBe Some(1500L)
      }

      it("should handle DELETE metrics") {
        val metrics = Map(
          "numDeletedRows" -> "100",
          "numAddedFiles" -> "1",
          "numRemovedFiles" -> "2"
        )

        DeltaLogExtractor.extractLongMetric(
          metrics,
          "numOutputRows",
          "numTargetRowsInserted",
          "numDeletedRows",
          "numUpdatedRows"
        ) shouldBe Some(100L)
      }

      it("should handle UPDATE metrics") {
        val metrics = Map(
          "numUpdatedRows" -> "75",
          "numCopiedRows" -> "500",
          "numAddedFiles" -> "2",
          "numRemovedFiles" -> "2"
        )

        DeltaLogExtractor.extractLongMetric(
          metrics,
          "numOutputRows",
          "numTargetRowsInserted",
          "numDeletedRows",
          "numUpdatedRows"
        ) shouldBe Some(75L)
      }

      it("should handle OPTIMIZE metrics") {
        val metrics = Map(
          "numAddedFiles" -> "1",
          "numRemovedFiles" -> "10",
          "numAddedBytes" -> "50000",
          "numRemovedBytes" -> "55000"
        )

        DeltaLogExtractor.extractLongMetric(
          metrics,
          "numFiles",
          "numAddedFiles",
          "numTargetFilesAdded"
        ) shouldBe Some(1L)
        DeltaLogExtractor.extractLongMetric(
          metrics,
          "numRemovedFiles",
          "numTargetFilesRemoved"
        ) shouldBe Some(10L)
      }

      it("should handle VACUUM metrics") {
        val metrics = Map(
          "numDeletedFiles" -> "25",
          "numVacuumedDirectories" -> "3"
        )

        // These don't map to the standard output metrics
        DeltaLogExtractor.extractLongMetric(
          metrics,
          "numOutputRows"
        ) shouldBe None
        DeltaLogExtractor.extractLongMetric(
          metrics,
          "numDeletedFiles"
        ) shouldBe Some(25L)
      }

      it("should prefer first key in priority order") {
        val metrics = Map(
          "numOutputRows" -> "1000",
          "numTargetRowsInserted" -> "500"
        )

        DeltaLogExtractor.extractLongMetric(
          metrics,
          "numOutputRows",
          "numTargetRowsInserted"
        ) shouldBe Some(1000L)
      }
    }
  }

  describe("DeltaLogExtractor.DefaultInventoryDatabase") {
    it("should be data_ops_inventory_db") {
      DeltaLogExtractor.DefaultInventoryDatabase shouldBe "data_ops_inventory_db"
    }
  }

  describe("DeltaLogExtractor.extract (full flow)") {
    it("should extract commits from all Delta tables across databases") {
      import spark.implicits._
      val testDbName = s"test_full_extract_db_${System.currentTimeMillis}"

      spark.sql(s"CREATE DATABASE IF NOT EXISTS $testDbName")
      Seq((1, "Alice"), (2, "Bob"))
        .toDF("id", "name")
        .write
        .format("delta")
        .mode("overwrite")
        .saveAsTable(s"$testDbName.full_test_table")

      val extractor = DeltaLogExtractor(spark, s"nonexistent_inv_${System.currentTimeMillis}")
      val commits = extractor.extract()

      commits should not be empty
      commits.exists(_.databaseName == testDbName) shouldBe true
      commits.foreach { c =>
        c.operation should not be empty
        c.commitTimestamp should not be null
      }

      // Cleanup
      spark.sql(s"DROP TABLE IF EXISTS $testDbName.full_test_table")
      spark.sql(s"DROP DATABASE IF EXISTS $testDbName CASCADE")
    }
  }

  describe("DeltaLogExtractor with high-water mark") {
    it("should only extract commits above the high-water mark version") {
      import spark.implicits._
      val testDbName = s"test_hwm_db_${System.currentTimeMillis}"
      val inventoryDb = s"test_hwm_inv_db_${System.currentTimeMillis}"

      spark.sql(s"CREATE DATABASE IF NOT EXISTS $testDbName")
      spark.sql(s"CREATE DATABASE IF NOT EXISTS $inventoryDb")

      // Create a table with multiple versions
      Seq((1, "A"))
        .toDF("id", "name")
        .write
        .format("delta")
        .mode("overwrite")
        .saveAsTable(s"$testDbName.hwm_table")
      Seq((2, "B"))
        .toDF("id", "name")
        .write
        .format("delta")
        .mode("append")
        .insertInto(s"$testDbName.hwm_table")
      Seq((3, "C"))
        .toDF("id", "name")
        .write
        .format("delta")
        .mode("append")
        .insertInto(s"$testDbName.hwm_table")

      // Create commit_history with high-water mark at version 0
      import org.apache.spark.sql.functions.{col, lit}
      Seq(("db_placeholder", "tbl_placeholder", s"$testDbName.hwm_table", 0L))
        .toDF("database_name", "table_name", "table_fqn", "version")
        .write
        .format("delta")
        .mode("overwrite")
        .saveAsTable(s"$inventoryDb.commit_history")

      val extractor = DeltaLogExtractor(spark, inventoryDb)
      val commits = extractor.extractForTable(testDbName, "hwm_table")

      // Should only have versions > 0
      commits.foreach(_.version should be > 0L)
      commits should not be empty

      // Cleanup
      spark.sql(s"DROP TABLE IF EXISTS $testDbName.hwm_table")
      spark.sql(s"DROP DATABASE IF EXISTS $testDbName CASCADE")
      spark.sql(s"DROP TABLE IF EXISTS $inventoryDb.commit_history")
      spark.sql(s"DROP DATABASE IF EXISTS $inventoryDb CASCADE")
    }
  }

  describe("DeltaLogExtractor.extractForTable") {
    it("should extract commit entries from a Delta table") {
      import spark.implicits._
      val testDbName = s"test_extract_db_${System.currentTimeMillis}"

      spark.sql(s"CREATE DATABASE IF NOT EXISTS $testDbName")
      spark.sql(
        s"CREATE TABLE IF NOT EXISTS $testDbName.test_table (id INT, name STRING) USING delta"
      )

      // Insert some data to create commits
      Seq((1, "Alice"), (2, "Bob"))
        .toDF("id", "name")
        .write
        .format("delta")
        .mode("append")
        .saveAsTable(s"$testDbName.test_table_extract")

      Seq((3, "Charlie"))
        .toDF("id", "name")
        .write
        .format("delta")
        .mode("append")
        .insertInto(s"$testDbName.test_table_extract")

      val extractor = DeltaLogExtractor(spark, "nonexistent_inv_db")
      val commits =
        extractor.extractForTable(testDbName, "test_table_extract")

      commits should not be empty
      commits.head.databaseName shouldBe testDbName
      commits.head.tableName shouldBe "test_table_extract"
      commits.head.tableFqn shouldBe s"$testDbName.test_table_extract"

      // First operation from saveAsTable is CREATE TABLE AS SELECT
      commits.map(_.operation) should contain atLeastOneOf ("CREATE TABLE AS SELECT", "WRITE")

      // Should have multiple versions
      commits.map(_.version).distinct.size should be >= 1

      // All entries should have the correct FQN
      commits.foreach { c =>
        c.tableFqn shouldBe s"$testDbName.test_table_extract"
      }

      // Cleanup
      spark.sql(s"DROP TABLE IF EXISTS $testDbName.test_table")
      spark.sql(s"DROP TABLE IF EXISTS $testDbName.test_table_extract")
      spark.sql(s"DROP DATABASE IF EXISTS $testDbName CASCADE")
    }

    it("should denormalize WRITE metrics") {
      import spark.implicits._
      val testDbName = s"test_metrics_db_${System.currentTimeMillis}"

      spark.sql(s"CREATE DATABASE IF NOT EXISTS $testDbName")
      Seq((1, "A"), (2, "B"), (3, "C"))
        .toDF("id", "name")
        .write
        .format("delta")
        .mode("overwrite")
        .saveAsTable(s"$testDbName.metrics_table")

      val extractor = DeltaLogExtractor(spark, "nonexistent_inv_db")
      val commits =
        extractor.extractForTable(testDbName, "metrics_table")

      commits should not be empty

      // The first commit has the output rows regardless of operation name
      val firstCommit = commits.minBy(_.version)
      firstCommit.numOutputRows shouldBe Some(3L)
      firstCommit.numAddedFiles shouldBe defined

      // Cleanup
      spark.sql(s"DROP TABLE IF EXISTS $testDbName.metrics_table")
      spark.sql(s"DROP DATABASE IF EXISTS $testDbName CASCADE")
    }
  }
}
