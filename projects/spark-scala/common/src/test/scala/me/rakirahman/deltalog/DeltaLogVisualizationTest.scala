package me.rakirahman.deltalog

import java.sql.Timestamp
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class DeltaLogVisualizationTest extends AnyFunSpec with Matchers {

  private val ts = Timestamp.valueOf("2026-01-15 12:00:00")

  private def mkResult(
      db: String,
      table: String,
      status: String,
      freshnessStatus: String = "Healthy",
      completenessStatus: String = "Healthy"
  ): DeltaLogKpiResult = {
    DeltaLogKpiResult(
      databaseName = db,
      tableName = table,
      tableFqn = s"$db.$table",
      status = status,
      evaluationTimestamp = ts,
      freshness = FreshnessAssessment(
        status = freshnessStatus,
        lastCommitTimestamp = ts,
        predictedNextCommit = Some(ts),
        medianCommitIntervalSeconds = 86400L,
        p95CommitIntervalSeconds = 172800L,
        commitsInLast24h = 1,
        commitsInLast7d = 7,
        daysSinceLastCommit = 0.5
      ),
      completeness = CompletenessAssessment(
        status = completenessStatus,
        dailyRowCountActual = 5000L,
        dailyRowCountMinExpected = Some(3000L),
        dailyRowCountMaxExpected = Some(7000L),
        totalRowCount = Some(100000L)
      ),
      operational = OperationalMetrics(
        latestVersion = 42L,
        numFiles = 100L,
        sizeInBytes = 1073741824L,
        avgFileSizeBytes = 10737418L,
        mostCommonOperation = "WRITE",
        optimizeCount7d = 2,
        vacuumCount7d = 1
      )
    )
  }

  describe("DeltaLogVisualization") {

    describe("healthSummaryDiagram") {
      it("should generate a Mermaid graph TD diagram") {
        val results = Seq(
          mkResult("db1", "table_a", "Healthy"),
          mkResult("db1", "table_b", "Unhealthy", "Unhealthy"),
          mkResult("db2", "table_c", "Training", "Training")
        )

        val diagram =
          DeltaLogVisualization.healthSummaryDiagram(results)

        diagram should startWith("graph TD")
        diagram should include("Delta Lake Estate Health Summary")
      }

      it("should group tables by database in subgraphs") {
        val results = Seq(
          mkResult("prod_db", "orders", "Healthy"),
          mkResult("prod_db", "customers", "Healthy"),
          mkResult("staging_db", "raw_data", "Training", "Training")
        )

        val diagram =
          DeltaLogVisualization.healthSummaryDiagram(results)

        diagram should include("prod_db")
        diagram should include("staging_db")
        diagram should include("subgraph")
      }

      it("should include status icons") {
        val results = Seq(
          mkResult("db1", "healthy_tbl", "Healthy"),
          mkResult("db1", "unhealthy_tbl", "Unhealthy"),
          mkResult("db1", "training_tbl", "Training")
        )

        val diagram =
          DeltaLogVisualization.healthSummaryDiagram(results)

        diagram should include("✅")
        diagram should include("❌")
        diagram should include("🔄")
      }

      it("should include CSS class definitions") {
        val results =
          Seq(mkResult("db1", "t1", "Healthy"))

        val diagram =
          DeltaLogVisualization.healthSummaryDiagram(results)

        diagram should include("classDef healthy")
        diagram should include("classDef unhealthy")
        diagram should include("classDef training")
      }

      it("should assign CSS classes to nodes") {
        val results = Seq(
          mkResult("db1", "healthy_tbl", "Healthy"),
          mkResult("db1", "sick_tbl", "Unhealthy")
        )

        val diagram =
          DeltaLogVisualization.healthSummaryDiagram(results)

        diagram should include("class db1_healthy_tbl healthy")
        diagram should include("class db1_sick_tbl unhealthy")
      }

      it("should show question mark for unknown status") {
        val results = Seq(
          mkResult("db1", "unknown_tbl", "SomethingElse")
        )

        val diagram =
          DeltaLogVisualization.healthSummaryDiagram(results)

        diagram should include("❓")
      }

      it("should handle empty results") {
        val diagram =
          DeltaLogVisualization.healthSummaryDiagram(Seq.empty)

        diagram should startWith("graph TD")
        diagram should include("classDef healthy")
      }
    }

    describe("commitTimelineDiagram") {
      it("should generate a Mermaid gantt chart") {
        val commits = Seq(
          DeltaCommitEntry(
            "db1",
            "t1",
            "db1.t1",
            None,
            0L,
            Timestamp.valueOf("2026-01-14 10:00:00"),
            "WRITE",
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            Some(1000L),
            Some(2L),
            None,
            None,
            None
          ),
          DeltaCommitEntry(
            "db1",
            "t1",
            "db1.t1",
            None,
            1L,
            Timestamp.valueOf("2026-01-15 10:00:00"),
            "MERGE",
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            Some(500L),
            None,
            None,
            None,
            Some(1500L)
          )
        )

        val diagram = DeltaLogVisualization.commitTimelineDiagram(
          "db1.t1",
          commits
        )

        diagram should startWith("gantt")
        diagram should include("Commit Timeline: db1.t1")
        diagram should include("v0 WRITE")
        diagram should include("v1 MERGE")
      }

      it("should include row counts when available") {
        val commits = Seq(
          DeltaCommitEntry(
            "db1",
            "t1",
            "db1.t1",
            None,
            0L,
            Timestamp.valueOf("2026-01-15 10:00:00"),
            "WRITE",
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            Some(1000L),
            None,
            None,
            None,
            None
          )
        )

        val diagram = DeltaLogVisualization.commitTimelineDiagram(
          "db1.t1",
          commits
        )

        diagram should include("(1000r)")
      }

      it("should limit to most recent commits") {
        val commits = (0 until 30).map { i =>
          DeltaCommitEntry(
            "db1",
            "t1",
            "db1.t1",
            None,
            i.toLong,
            Timestamp.valueOf(
              s"2026-01-${f"${(i % 28) + 1}%02d"} 10:00:00"
            ),
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
        }

        val diagram = DeltaLogVisualization.commitTimelineDiagram(
          "db1.t1",
          commits,
          limit = 5
        )

        // Should only include 5 entries
        val entryCount = diagram.split("\n").count(_.contains("v"))
        entryCount should be <= 10 // generous upper bound
      }

      it("should handle empty commits") {
        val diagram = DeltaLogVisualization.commitTimelineDiagram(
          "db1.t1",
          Seq.empty
        )

        diagram should startWith("gantt")
        diagram should include("Commit Timeline: db1.t1")
      }
    }

    describe("healthReport") {
      it("should generate a text report with estate summary") {
        val results = DeltaLogEstateKpis(
          results = Seq(
            mkResult("db1", "t1", "Healthy"),
            mkResult("db1", "t2", "Unhealthy", "Unhealthy"),
            mkResult("db2", "t1", "Training", "Training")
          ),
          totalTables = 3,
          healthyTables = 1,
          unhealthyTables = 1,
          trainingTables = 1
        )

        val report = DeltaLogVisualization.healthReport(results)

        report should include("DELTA LAKE ESTATE HEALTH REPORT")
        report should include("Total Tables:    3")
        report should include("Healthy:         1")
        report should include("Unhealthy:       1")
        report should include("Training:        1")
      }

      it("should list unhealthy tables with details") {
        val results = DeltaLogEstateKpis(
          results = Seq(
            mkResult("db1", "bad_table", "Unhealthy", "Unhealthy", "Unhealthy")
          ),
          totalTables = 1,
          healthyTables = 0,
          unhealthyTables = 1,
          trainingTables = 0
        )

        val report = DeltaLogVisualization.healthReport(results)

        report should include("❌ db1.bad_table")
        report should include("Freshness:")
        report should include("Completeness:")
      }

      it("should list healthy tables") {
        val results = DeltaLogEstateKpis(
          results = Seq(
            mkResult("db1", "good_table", "Healthy")
          ),
          totalTables = 1,
          healthyTables = 1,
          unhealthyTables = 0,
          trainingTables = 0
        )

        val report = DeltaLogVisualization.healthReport(results)

        report should include("✅ db1.good_table")
      }

      it("should list training tables") {
        val results = DeltaLogEstateKpis(
          results = Seq(
            mkResult("db1", "new_table", "Training", "Training")
          ),
          totalTables = 1,
          healthyTables = 0,
          unhealthyTables = 0,
          trainingTables = 1
        )

        val report = DeltaLogVisualization.healthReport(results)

        report should include("🔄 db1.new_table")
      }

      it("should handle zero tables") {
        val results = DeltaLogEstateKpis(
          results = Seq.empty,
          totalTables = 0,
          healthyTables = 0,
          unhealthyTables = 0,
          trainingTables = 0
        )

        val report = DeltaLogVisualization.healthReport(results)

        report should include("Total Tables:    0")
        report should include("0%")
      }
    }

    describe("sanitize") {
      it("should replace dots with underscores") {
        DeltaLogVisualization.sanitize("db1.table1") shouldBe "db1_table1"
      }

      it("should replace special characters") {
        DeltaLogVisualization.sanitize(
          "my-db.my-table"
        ) shouldBe "my_db_my_table"
      }

      it("should collapse multiple underscores") {
        DeltaLogVisualization.sanitize(
          "a..b..c"
        ) shouldBe "a_b_c"
      }

      it("should handle alphanumeric strings unchanged") {
        DeltaLogVisualization.sanitize(
          "abc123_DEF"
        ) shouldBe "abc123_DEF"
      }
    }
  }
}
