package me.rakirahman.deltalog

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers

class DeltaLogKpiQueriesTest extends AnyFunSpec with Matchers {

  describe("DeltaLogKpiQueries") {

    describe("freshnessQuery") {
      it("should generate valid SQL with the given view name") {
        val query = DeltaLogKpiQueries.freshnessQuery("test_view")

        query should include("test_view")
        query should include("commit_intervals")
        query should include("interval_stats")
        query should include("latest_commits")
        query should include("percentile_approx")
        query should include("freshness_status")
        query should include("predicted_next_commit")
        query should include("days_since_last_commit")
      }

      it("should exclude maintenance operations") {
        val query = DeltaLogKpiQueries.freshnessQuery("test_view")

        query should include("OPTIMIZE")
        query should include("VACUUM")
        query should include("RESTORE")
        query should include("SET TBLPROPERTIES")
        query should include("NOT IN")
      }

      it("should use p95 for staleness threshold") {
        val query = DeltaLogKpiQueries.freshnessQuery("test_view")

        query should include("p95_interval_seconds")
        query should include("0.95")
      }

      it("should mark tables with < 5 intervals as Training") {
        val query = DeltaLogKpiQueries.freshnessQuery("test_view")

        query should include("< 5")
        query should include("Training")
      }
    }

    describe("completenessQuery") {
      it("should generate valid SQL with the given view name") {
        val query = DeltaLogKpiQueries.completenessQuery("test_view")

        query should include("test_view")
        query should include("daily_row_counts")
        query should include("row_count_stats")
        query should include("today_row_counts")
        query should include("completeness_status")
      }

      it("should filter to row-producing operations") {
        val query = DeltaLogKpiQueries.completenessQuery("test_view")

        query should include("WRITE")
        query should include("MERGE")
        query should include("STREAMING UPDATE")
      }

      it("should use mean ± 2σ for expected range") {
        val query = DeltaLogKpiQueries.completenessQuery("test_view")

        query should include("avg_daily_rows")
        query should include("stddev_daily_rows")
        query should include("2 *")
      }

      it("should mark tables with < 7 days as Training") {
        val query = DeltaLogKpiQueries.completenessQuery("test_view")

        query should include("< 7")
        query should include("Training")
      }

      it("should exclude today's partial data from statistics") {
        val query = DeltaLogKpiQueries.completenessQuery("test_view")

        query should include("commit_date < CURRENT_DATE()")
      }
    }

    describe("operationalQuery") {
      it("should generate valid SQL with the given view name") {
        val query = DeltaLogKpiQueries.operationalQuery("test_view")

        query should include("test_view")
        query should include("latest_version")
        query should include("most_common_operation")
        query should include("optimize_count_7d")
        query should include("vacuum_count_7d")
      }

      it("should count OPTIMIZE and VACUUM in last 7 days") {
        val query = DeltaLogKpiQueries.operationalQuery("test_view")

        query should include("OPTIMIZE")
        query should include("VACUUM")
        query should include("7 DAYS")
      }
    }

    describe("sourceViewQuery") {
      it("should generate a lookback query") {
        val query =
          DeltaLogKpiQueries.sourceViewQuery("my_inv_db", 30)

        query should include("my_inv_db.commit_history")
        query should include("snapshot_date >=")
        query should include("30")
      }

      it("should support custom lookback days") {
        val query =
          DeltaLogKpiQueries.sourceViewQuery("db", 90)

        query should include("90")
      }
    }
  }
}
