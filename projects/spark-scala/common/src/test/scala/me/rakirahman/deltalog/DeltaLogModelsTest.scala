package me.rakirahman.deltalog

import java.sql.Timestamp
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class DeltaLogModelsTest extends AnyFunSpec with Matchers {

  describe("DeltaCommitEntry") {
    it("should construct with all required fields") {
      val entry = DeltaCommitEntry(
        databaseName = "test_db",
        tableName = "test_table",
        tableFqn = "test_db.test_table",
        tableId = Some("uuid-123"),
        version = 5L,
        commitTimestamp = Timestamp.valueOf("2026-01-15 10:30:00"),
        operation = "WRITE",
        operationParameters = Some(Map("mode" -> "Append")),
        operationMetrics = Some(Map("numOutputRows" -> "1000", "numFiles" -> "2")),
        readVersion = Some(4L),
        isolationLevel = Some("WriteSerializable"),
        isBlindAppend = Some(true),
        userId = Some("user1"),
        userName = Some("Test User"),
        userMetadata = None,
        numOutputRows = Some(1000L),
        numAddedFiles = Some(2L),
        numRemovedFiles = None,
        numOutputBytes = Some(5000L),
        executionTimeMs = None
      )

      entry.databaseName shouldBe "test_db"
      entry.tableName shouldBe "test_table"
      entry.tableFqn shouldBe "test_db.test_table"
      entry.tableId shouldBe Some("uuid-123")
      entry.version shouldBe 5L
      entry.operation shouldBe "WRITE"
      entry.isBlindAppend shouldBe Some(true)
      entry.numOutputRows shouldBe Some(1000L)
    }

    it("should handle None optional fields") {
      val entry = DeltaCommitEntry(
        databaseName = "db",
        tableName = "tbl",
        tableFqn = "db.tbl",
        tableId = None,
        version = 0L,
        commitTimestamp = Timestamp.valueOf("2026-01-01 00:00:00"),
        operation = "WRITE",
        operationParameters = None,
        operationMetrics = None,
        readVersion = None,
        isolationLevel = None,
        isBlindAppend = None,
        userId = None,
        userName = None,
        userMetadata = None,
        numOutputRows = None,
        numAddedFiles = None,
        numRemovedFiles = None,
        numOutputBytes = None,
        executionTimeMs = None
      )

      entry.tableId shouldBe None
      entry.operationMetrics shouldBe None
      entry.numOutputRows shouldBe None
    }
  }

  describe("DeltaTableSnapshot") {
    it("should construct with metadata fields") {
      val snapshot = DeltaTableSnapshot(
        databaseName = "prod_db",
        tableName = "orders",
        tableFqn = "prod_db.orders",
        tableId = Some("snap-uuid"),
        format = "delta",
        location = "/data/prod_db/orders",
        createdAt = Timestamp.valueOf("2025-06-01 00:00:00"),
        lastModified = Timestamp.valueOf("2026-01-15 12:00:00"),
        numFiles = 50L,
        sizeInBytes = 1073741824L,
        sizeInGb = 1.0,
        partitionColumns = Array("year", "month"),
        clusteringColumns = Array.empty,
        tableProperties = Map("delta.autoOptimize.optimizeWrite" -> "true"),
        minReaderVersion = 1,
        minWriterVersion = 2
      )

      snapshot.format shouldBe "delta"
      snapshot.numFiles shouldBe 50L
      snapshot.sizeInGb shouldBe 1.0
      snapshot.partitionColumns should contain theSameElementsAs Seq(
        "year",
        "month"
      )
      snapshot.tableProperties should contain key "delta.autoOptimize.optimizeWrite"
    }
  }

  describe("FreshnessAssessment") {
    it("should represent a healthy table") {
      val assessment = FreshnessAssessment(
        status = "Healthy",
        lastCommitTimestamp = Timestamp.valueOf("2026-01-15 10:00:00"),
        predictedNextCommit = Some(Timestamp.valueOf("2026-01-16 10:00:00")),
        medianCommitIntervalSeconds = 86400L,
        p95CommitIntervalSeconds = 172800L,
        commitsInLast24h = 1,
        commitsInLast7d = 7,
        daysSinceLastCommit = 0.5
      )

      assessment.status shouldBe "Healthy"
      assessment.daysSinceLastCommit shouldBe 0.5
    }

    it("should represent a training table") {
      val assessment = FreshnessAssessment(
        status = "Training",
        lastCommitTimestamp = Timestamp.valueOf("2026-01-15 10:00:00"),
        predictedNextCommit = None,
        medianCommitIntervalSeconds = 0L,
        p95CommitIntervalSeconds = 0L,
        commitsInLast24h = 2,
        commitsInLast7d = 3,
        daysSinceLastCommit = 0.1
      )

      assessment.status shouldBe "Training"
      assessment.predictedNextCommit shouldBe None
    }
  }

  describe("CompletenessAssessment") {
    it("should represent healthy completeness") {
      val assessment = CompletenessAssessment(
        status = "Healthy",
        dailyRowCountActual = 5000L,
        dailyRowCountMinExpected = Some(3000L),
        dailyRowCountMaxExpected = Some(7000L),
        totalRowCount = Some(100000L)
      )

      assessment.status shouldBe "Healthy"
      assessment.dailyRowCountActual shouldBe 5000L
    }

    it("should handle missing expected values") {
      val assessment = CompletenessAssessment(
        status = "Training",
        dailyRowCountActual = 100L,
        dailyRowCountMinExpected = None,
        dailyRowCountMaxExpected = None,
        totalRowCount = None
      )

      assessment.dailyRowCountMinExpected shouldBe None
    }
  }

  describe("OperationalMetrics") {
    it("should capture table operational state") {
      val metrics = OperationalMetrics(
        latestVersion = 42L,
        numFiles = 100L,
        sizeInBytes = 1073741824L,
        avgFileSizeBytes = 10737418L,
        mostCommonOperation = "MERGE",
        optimizeCount7d = 2,
        vacuumCount7d = 1
      )

      metrics.latestVersion shouldBe 42L
      metrics.mostCommonOperation shouldBe "MERGE"
    }
  }

  describe("DeltaLogKpiResult") {
    it("should aggregate freshness, completeness, and operational metrics") {
      val result = DeltaLogKpiResult(
        databaseName = "db1",
        tableName = "t1",
        tableFqn = "db1.t1",
        status = "Healthy",
        evaluationTimestamp = Timestamp.valueOf("2026-01-15 12:00:00"),
        freshness = FreshnessAssessment(
          "Healthy",
          Timestamp.valueOf("2026-01-15 10:00:00"),
          Some(Timestamp.valueOf("2026-01-16 10:00:00")),
          86400L,
          172800L,
          1,
          7,
          0.1
        ),
        completeness = CompletenessAssessment("Healthy", 5000L, Some(3000L), Some(7000L), Some(100000L)),
        operational = OperationalMetrics(42L, 100L, 1073741824L, 10737418L, "WRITE", 2, 1)
      )

      result.status shouldBe "Healthy"
      result.freshness.status shouldBe "Healthy"
      result.completeness.status shouldBe "Healthy"
    }
  }

  describe("DeltaLogEstateKpis") {
    it("should compute aggregate counts") {
      val ts = Timestamp.valueOf("2026-01-15 12:00:00")
      val freshness = FreshnessAssessment(
        "Healthy",
        ts,
        Some(ts),
        86400L,
        172800L,
        1,
        7,
        0.1
      )
      val completeness =
        CompletenessAssessment("Healthy", 5000L, Some(3000L), Some(7000L), Some(100000L))
      val operational =
        OperationalMetrics(10L, 10L, 1000L, 100L, "WRITE", 0, 0)

      val results = Seq(
        DeltaLogKpiResult("db1", "t1", "db1.t1", "Healthy", ts, freshness, completeness, operational),
        DeltaLogKpiResult("db1", "t2", "db1.t2", "Unhealthy", ts, freshness, completeness, operational),
        DeltaLogKpiResult("db2", "t1", "db2.t1", "Training", ts, freshness, completeness, operational)
      )

      val estate = DeltaLogEstateKpis(
        results = results,
        totalTables = 3,
        healthyTables = 1,
        unhealthyTables = 1,
        trainingTables = 1
      )

      estate.totalTables shouldBe 3
      estate.healthyTables shouldBe 1
      estate.unhealthyTables shouldBe 1
      estate.trainingTables shouldBe 1
      estate.results should have size 3
    }
  }
}
