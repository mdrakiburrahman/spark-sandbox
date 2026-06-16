WITH source AS (
    SELECT * FROM {{ source('dataops_inventory', 'kpi_results') }}
),

cleaned AS (
    SELECT
        table_fqn,
        overall_status,
        evaluation_timestamp,
        freshness_status,
        last_commit_timestamp,
        predicted_next_commit,
        median_commit_interval_seconds,
        p95_commit_interval_seconds,
        commits_in_last_24h,
        commits_in_last_7d,
        days_since_last_commit,
        completeness_status,
        daily_row_count_actual,
        daily_row_count_min_expected,
        daily_row_count_max_expected,
        latest_version,
        most_common_operation,
        optimize_count_7d,
        vacuum_count_7d,
        snapshot_date,
        snapshot_date AS date_key
    FROM source
)

SELECT * FROM cleaned
