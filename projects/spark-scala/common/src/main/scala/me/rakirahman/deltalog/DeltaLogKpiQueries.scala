package me.rakirahman.deltalog

/** Spark SQL query constants for computing KPIs from Delta transaction log data. Queries compute freshness (percentile-based), completeness (mean ± 2σ daily row counts), and operational metrics.
  */
object DeltaLogKpiQueries {

  /** Operations that represent actual data changes (excludes maintenance). */
  private val DataChangeOps =
    "('WRITE', 'MERGE', 'UPDATE', 'DELETE', 'STREAMING UPDATE', 'INSERT')"

  /** Operations that contribute to row volume metrics. */
  private val RowVolumeOps = "('WRITE', 'MERGE', 'STREAMING UPDATE')"

  /** Computes commit freshness KPIs per table.
    *
    * Uses inter-commit interval analysis with percentile-based thresholds:
    *   - p50 (median) interval → predicted next commit
    *   - p95 interval → staleness threshold
    *   - < 5 intervals → "Training" status
    */
  def freshnessQuery(viewName: String): String =
    s"""WITH commit_intervals AS (
       |  SELECT
       |    table_fqn,
       |    commit_timestamp,
       |    LAG(commit_timestamp) OVER (
       |      PARTITION BY table_fqn ORDER BY version
       |    ) AS prev_commit_timestamp,
       |    CAST(
       |      unix_timestamp(commit_timestamp) -
       |      unix_timestamp(LAG(commit_timestamp) OVER (
       |        PARTITION BY table_fqn ORDER BY version
       |      ))
       |    AS BIGINT) AS interval_seconds,
       |    version
       |  FROM $viewName
       |  WHERE operation NOT IN ('OPTIMIZE', 'VACUUM', 'RESTORE', 'SET TBLPROPERTIES')
       |),
       |interval_stats AS (
       |  SELECT
       |    table_fqn,
       |    percentile_approx(interval_seconds, 0.5) AS median_interval_seconds,
       |    percentile_approx(interval_seconds, 0.95) AS p95_interval_seconds,
       |    AVG(interval_seconds) AS avg_interval_seconds,
       |    STDDEV(interval_seconds) AS stddev_interval_seconds,
       |    COUNT(*) AS total_commits_with_intervals
       |  FROM commit_intervals
       |  WHERE interval_seconds IS NOT NULL AND interval_seconds > 0
       |  GROUP BY table_fqn
       |),
       |latest_commits AS (
       |  SELECT
       |    table_fqn,
       |    MAX(commit_timestamp) AS last_commit_timestamp,
       |    MAX(version) AS latest_version,
       |    COUNT(CASE WHEN commit_timestamp >= current_timestamp() - INTERVAL 24 HOURS THEN 1 END) AS commits_in_last_24h,
       |    COUNT(CASE WHEN commit_timestamp >= current_timestamp() - INTERVAL 7 DAYS THEN 1 END) AS commits_in_last_7d
       |  FROM $viewName
       |  WHERE operation NOT IN ('OPTIMIZE', 'VACUUM', 'RESTORE', 'SET TBLPROPERTIES')
       |  GROUP BY table_fqn
       |)
       |SELECT
       |  lc.table_fqn,
       |  lc.last_commit_timestamp,
       |  lc.latest_version,
       |  lc.commits_in_last_24h,
       |  lc.commits_in_last_7d,
       |  ist.median_interval_seconds,
       |  ist.p95_interval_seconds,
       |  ist.avg_interval_seconds,
       |  ist.stddev_interval_seconds,
       |  ist.total_commits_with_intervals,
       |  CAST(
       |    from_unixtime(
       |      unix_timestamp(lc.last_commit_timestamp) + COALESCE(ist.median_interval_seconds, 86400)
       |    ) AS TIMESTAMP
       |  ) AS predicted_next_commit,
       |  CAST(
       |    (unix_timestamp(current_timestamp()) - unix_timestamp(lc.last_commit_timestamp)) / 86400.0
       |  AS DOUBLE) AS days_since_last_commit,
       |  CASE
       |    WHEN ist.total_commits_with_intervals IS NULL OR ist.total_commits_with_intervals < 5 THEN 'Training'
       |    WHEN unix_timestamp(current_timestamp()) >
       |         unix_timestamp(lc.last_commit_timestamp) +
       |         COALESCE(ist.p95_interval_seconds, ist.median_interval_seconds * 2, 172800)
       |    THEN 'Unhealthy'
       |    ELSE 'Healthy'
       |  END AS freshness_status
       |FROM latest_commits lc
       |LEFT JOIN interval_stats ist ON lc.table_fqn = ist.table_fqn
       |""".stripMargin

  /** Computes row count completeness KPIs per table.
    *
    * Analyzes daily row volumes using a statistical model:
    *   - Expected range: mean ± 2 standard deviations
    *   - < 7 days of data → "Training" status
    *   - Actual rows today < min expected → "Unhealthy"
    */
  def completenessQuery(viewName: String): String =
    s"""WITH daily_row_counts AS (
       |  SELECT
       |    table_fqn,
       |    DATE(commit_timestamp) AS commit_date,
       |    SUM(COALESCE(num_output_rows, 0)) AS daily_rows
       |  FROM $viewName
       |  WHERE operation IN $RowVolumeOps
       |  GROUP BY table_fqn, DATE(commit_timestamp)
       |),
       |row_count_stats AS (
       |  SELECT
       |    table_fqn,
       |    percentile_approx(daily_rows, 0.05) AS p5_daily_rows,
       |    percentile_approx(daily_rows, 0.5) AS median_daily_rows,
       |    percentile_approx(daily_rows, 0.95) AS p95_daily_rows,
       |    AVG(daily_rows) AS avg_daily_rows,
       |    STDDEV(daily_rows) AS stddev_daily_rows,
       |    COUNT(*) AS days_with_data
       |  FROM daily_row_counts
       |  WHERE commit_date < CURRENT_DATE()
       |  GROUP BY table_fqn
       |),
       |today_row_counts AS (
       |  SELECT
       |    table_fqn,
       |    SUM(COALESCE(num_output_rows, 0)) AS rows_today
       |  FROM $viewName
       |  WHERE operation IN $RowVolumeOps
       |    AND commit_timestamp >= current_timestamp() - INTERVAL 24 HOURS
       |  GROUP BY table_fqn
       |)
       |SELECT
       |  rcs.table_fqn,
       |  COALESCE(trc.rows_today, 0) AS daily_row_count_actual,
       |  CAST(GREATEST(0, rcs.avg_daily_rows - 2 * COALESCE(rcs.stddev_daily_rows, 0)) AS BIGINT) AS daily_row_count_min_expected,
       |  CAST(rcs.avg_daily_rows + 2 * COALESCE(rcs.stddev_daily_rows, 0) AS BIGINT) AS daily_row_count_max_expected,
       |  rcs.median_daily_rows,
       |  rcs.days_with_data,
       |  CASE
       |    WHEN rcs.days_with_data < 7 THEN 'Training'
       |    WHEN COALESCE(trc.rows_today, 0) <
       |         GREATEST(0, rcs.avg_daily_rows - 2 * COALESCE(rcs.stddev_daily_rows, 0))
       |    THEN 'Unhealthy'
       |    ELSE 'Healthy'
       |  END AS completeness_status
       |FROM row_count_stats rcs
       |LEFT JOIN today_row_counts trc ON rcs.table_fqn = trc.table_fqn
       |""".stripMargin

  /** Computes operational KPIs per table. */
  def operationalQuery(viewName: String): String =
    s"""SELECT
       |  table_fqn,
       |  MAX(version) AS latest_version,
       |  FIRST(operation) AS most_common_operation,
       |  COUNT(CASE WHEN operation = 'OPTIMIZE' AND commit_timestamp >= current_timestamp() - INTERVAL 7 DAYS THEN 1 END) AS optimize_count_7d,
       |  COUNT(CASE WHEN operation = 'VACUUM' AND commit_timestamp >= current_timestamp() - INTERVAL 7 DAYS THEN 1 END) AS vacuum_count_7d,
       |  CAST(SUM(CASE WHEN commit_timestamp >= current_timestamp() - INTERVAL 7 DAYS
       |    THEN COALESCE(num_output_rows, 0) ELSE 0 END) / 7.0 AS BIGINT) AS avg_rows_per_day_7d
       |FROM $viewName
       |GROUP BY table_fqn
       |""".stripMargin

  /** Creates a source view from the commit_history table with a lookback window.
    */
  def sourceViewQuery(database: String, lookbackDays: Int): String =
    s"""SELECT *
       |FROM $database.commit_history
       |WHERE snapshot_date >= date_format(date_sub(current_date(), $lookbackDays), 'yyyyMMdd')
       |""".stripMargin
}
