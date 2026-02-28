package me.rakirahman.deltalog

import me.rakirahman.metastore.sql.SqlMetastoreOperations

import org.apache.spark.sql.SparkSession
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class DeltaLogCommitStoreTest extends AnyFunSpec with Matchers {

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
      s"/tmp/DeltaLogCommitStoreTest-${System.currentTimeMillis}/warehouse"
    )
    .config("spark.driver.host", "localhost")
    .config("spark.ui.enabled", "false")
    .getOrCreate()

  lazy val metastoreOps: SqlMetastoreOperations = SqlMetastoreOperations(spark)

  describe("DeltaLogCommitStore") {

    describe("persistCommitHistory") {
      it("should persist commit entries to Delta table") {
        val inventoryDb =
          s"test_commit_store_db_${System.currentTimeMillis}"
        val store =
          new DeltaLogCommitStore(spark, metastoreOps, inventoryDb)

        val commits = Seq(
          DeltaCommitEntry(
            databaseName = "db1",
            tableName = "t1",
            tableFqn = "db1.t1",
            tableId = Some("id-1"),
            version = 0L,
            commitTimestamp = java.sql.Timestamp.valueOf("2026-01-15 10:00:00"),
            operation = "WRITE",
            operationParameters = Some(Map("mode" -> "Append")),
            operationMetrics = Some(Map("numOutputRows" -> "100", "numFiles" -> "1")),
            readVersion = None,
            isolationLevel = Some("WriteSerializable"),
            isBlindAppend = Some(true),
            userId = None,
            userName = None,
            userMetadata = None,
            numOutputRows = Some(100L),
            numAddedFiles = Some(1L),
            numRemovedFiles = None,
            numOutputBytes = Some(5000L),
            executionTimeMs = None
          ),
          DeltaCommitEntry(
            databaseName = "db1",
            tableName = "t1",
            tableFqn = "db1.t1",
            tableId = Some("id-1"),
            version = 1L,
            commitTimestamp = java.sql.Timestamp.valueOf("2026-01-16 10:00:00"),
            operation = "MERGE",
            operationParameters = None,
            operationMetrics = Some(Map("numOutputRows" -> "50")),
            readVersion = Some(0L),
            isolationLevel = Some("WriteSerializable"),
            isBlindAppend = Some(false),
            userId = None,
            userName = None,
            userMetadata = None,
            numOutputRows = Some(50L),
            numAddedFiles = None,
            numRemovedFiles = None,
            numOutputBytes = None,
            executionTimeMs = Some(500L)
          )
        )

        store.persistCommitHistory(commits)

        val result =
          spark.sql(s"SELECT * FROM $inventoryDb.commit_history")
        result.count() shouldBe 2

        val columns = result.columns.toSet
        columns should contain("databaseName")
        columns should contain("tableName")
        columns should contain("tableFqn")
        columns should contain("version")
        columns should contain("commitTimestamp")
        columns should contain("operation")
        columns should contain("ingested_at")
        columns should contain("snapshot_date")

        // Cleanup
        spark.sql(s"DROP TABLE IF EXISTS $inventoryDb.commit_history")
        spark.sql(s"DROP DATABASE IF EXISTS $inventoryDb CASCADE")
      }

      it("should handle empty commits gracefully") {
        val inventoryDb =
          s"test_empty_store_db_${System.currentTimeMillis}"
        val store =
          new DeltaLogCommitStore(spark, metastoreOps, inventoryDb)

        // Should not throw
        store.persistCommitHistory(Seq.empty)

        // Table should not exist since nothing was persisted
        spark.catalog.tableExists(inventoryDb, "commit_history") shouldBe false
      }

      it("should append to existing commit history") {
        val inventoryDb =
          s"test_append_store_db_${System.currentTimeMillis}"
        val store =
          new DeltaLogCommitStore(spark, metastoreOps, inventoryDb)

        val batch1 = Seq(
          DeltaCommitEntry(
            "db1",
            "t1",
            "db1.t1",
            None,
            0L,
            java.sql.Timestamp.valueOf("2026-01-15 10:00:00"),
            "WRITE",
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            Some(100L),
            None,
            None,
            None,
            None
          )
        )

        val batch2 = Seq(
          DeltaCommitEntry(
            "db1",
            "t1",
            "db1.t1",
            None,
            1L,
            java.sql.Timestamp.valueOf("2026-01-16 10:00:00"),
            "WRITE",
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            Some(200L),
            None,
            None,
            None,
            None
          )
        )

        store.persistCommitHistory(batch1)
        store.persistCommitHistory(batch2)

        val result =
          spark.sql(s"SELECT * FROM $inventoryDb.commit_history")
        result.count() shouldBe 2

        // Cleanup
        spark.sql(s"DROP TABLE IF EXISTS $inventoryDb.commit_history")
        spark.sql(s"DROP DATABASE IF EXISTS $inventoryDb CASCADE")
      }
    }

    describe("captureTableSnapshots") {
      it("should handle empty snapshot results gracefully") {
        val emptyDb = s"test_empty_snapshot_db_${System.currentTimeMillis}"
        val inventoryDb = s"test_empty_snap_inv_db_${System.currentTimeMillis}"

        // Create a database with no Delta tables
        spark.sql(s"CREATE DATABASE IF NOT EXISTS $emptyDb")

        val store = new DeltaLogCommitStore(spark, metastoreOps, inventoryDb)
        // Should not throw — captures nothing because no Delta tables exist
        store.captureTableSnapshots()

        // Cleanup
        spark.sql(s"DROP DATABASE IF EXISTS $emptyDb CASCADE")
      }

      it("should capture snapshots from Delta tables") {
        val testDb = s"test_snapshot_source_db_${System.currentTimeMillis}"
        val inventoryDb =
          s"test_snapshot_store_db_${System.currentTimeMillis}"

        import spark.implicits._
        spark.sql(s"CREATE DATABASE IF NOT EXISTS $testDb")
        Seq((1, "A"), (2, "B"))
          .toDF("id", "name")
          .write
          .format("delta")
          .mode("overwrite")
          .saveAsTable(s"$testDb.snapshot_test_table")

        val store =
          new DeltaLogCommitStore(spark, metastoreOps, inventoryDb)
        store.captureTableSnapshots()

        val snapshots =
          spark.sql(s"SELECT * FROM $inventoryDb.table_snapshots")
        snapshots.count() should be >= 1L

        val columns = snapshots.columns.toSet
        columns should contain("databaseName")
        columns should contain("tableName")
        columns should contain("tableFqn")
        columns should contain("format")
        columns should contain("numFiles")
        columns should contain("sizeInBytes")
        columns should contain("snapshot_date")

        // Cleanup
        spark.sql(s"DROP TABLE IF EXISTS $testDb.snapshot_test_table")
        spark.sql(s"DROP DATABASE IF EXISTS $testDb CASCADE")
        spark.sql(s"DROP TABLE IF EXISTS $inventoryDb.table_snapshots")
        spark.sql(s"DROP DATABASE IF EXISTS $inventoryDb CASCADE")
      }
    }
  }
}
