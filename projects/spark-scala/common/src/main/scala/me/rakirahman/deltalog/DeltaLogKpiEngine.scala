package me.rakirahman.deltalog

import org.apache.spark.internal.Logging
import org.apache.spark.sql.{DataFrame, SparkSession}

/** Computes KPIs from Delta transaction log commit history.
  *
  * Provides two factory paths:
  *   - From a metastore table (production): reads `commit_history` with a lookback window
  *   - From a DataFrame (unit testing): creates a temp view from the provided data
  */
class DeltaLogKpiEngine private (
    spark: SparkSession,
    viewName: String
) extends Logging {

  /** Computes freshness KPIs for all tables. */
  def computeFreshness(): DataFrame = {
    spark.sql(DeltaLogKpiQueries.freshnessQuery(viewName))
  }

  /** Computes completeness KPIs for all tables. */
  def computeCompleteness(): DataFrame = {
    spark.sql(DeltaLogKpiQueries.completenessQuery(viewName))
  }

  /** Computes operational KPIs for all tables. */
  def computeOperational(): DataFrame = {
    spark.sql(DeltaLogKpiQueries.operationalQuery(viewName))
  }

  /** Computes all KPIs and joins them into a unified result. */
  def computeAll(): DataFrame = {
    val freshness = computeFreshness()
    val completeness = computeCompleteness()
    val operational = computeOperational()

    freshness.createOrReplaceTempView("freshness_kpis")
    completeness.createOrReplaceTempView("completeness_kpis")
    operational.createOrReplaceTempView("operational_kpis")

    spark.sql("""
      SELECT
        f.table_fqn,
        CASE
          WHEN f.freshness_status = 'Unhealthy' OR c.completeness_status = 'Unhealthy' THEN 'Unhealthy'
          WHEN f.freshness_status = 'Training' OR c.completeness_status = 'Training' THEN 'Training'
          ELSE 'Healthy'
        END AS overall_status,
        current_timestamp() AS evaluation_timestamp,
        f.freshness_status,
        f.last_commit_timestamp,
        f.predicted_next_commit,
        f.median_interval_seconds AS median_commit_interval_seconds,
        f.p95_interval_seconds AS p95_commit_interval_seconds,
        f.commits_in_last_24h,
        f.commits_in_last_7d,
        f.days_since_last_commit,
        c.completeness_status,
        c.daily_row_count_actual,
        c.daily_row_count_min_expected,
        c.daily_row_count_max_expected,
        o.latest_version,
        o.most_common_operation,
        o.optimize_count_7d,
        o.vacuum_count_7d
      FROM freshness_kpis f
      LEFT JOIN completeness_kpis c ON f.table_fqn = c.table_fqn
      LEFT JOIN operational_kpis o ON f.table_fqn = o.table_fqn
    """)
  }
}

object DeltaLogKpiEngine {
  private val TempViewName = "delta_log_kpi_source"

  /** Creates from the persisted commit_history table with a lookback window. */
  def apply(
      spark: SparkSession,
      inventoryDatabase: String = DeltaLogExtractor.DefaultInventoryDatabase,
      lookbackDays: Int = 30
  ): DeltaLogKpiEngine = {
    val query =
      DeltaLogKpiQueries.sourceViewQuery(inventoryDatabase, lookbackDays)
    spark.sql(query).createOrReplaceTempView(TempViewName)
    new DeltaLogKpiEngine(spark, TempViewName)
  }

  /** Creates from a DataFrame (for unit testing). */
  def apply(
      spark: SparkSession,
      commitHistoryDf: DataFrame
  ): DeltaLogKpiEngine = {
    commitHistoryDf.createOrReplaceTempView(TempViewName)
    new DeltaLogKpiEngine(spark, TempViewName)
  }
}
