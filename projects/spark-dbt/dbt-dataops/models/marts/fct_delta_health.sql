{{
    config(
        materialized='incremental',
        incremental_strategy='append',
        file_format='delta',
        location_root='none',
        on_schema_change='append_new_columns',
        partition_by=['event_year_date']
    )
}}

WITH src AS (
    SELECT
        *,
        row_number() OVER (
            PARTITION BY table_fqn, snapshot_date, evaluation_timestamp
            ORDER BY evaluation_timestamp DESC
        ) AS _row_num
    FROM {{ ref('stg_delta_kpi_results') }}
    {% if is_incremental() %}
        WHERE
            date_key >= (SELECT max(date_key) FROM {{ this }})
            AND evaluation_timestamp > (SELECT max(evaluation_timestamp) FROM {{ this }})
    {% endif %}
),

deduped AS (
    SELECT * FROM src WHERE _row_num = 1
),

dim_tbl AS (
    SELECT __pk AS table_key, table_fqn, row_effective_start, row_effective_end
    FROM {{ ref('dim_delta_table') }}
),

dim_hs AS (
    SELECT health_status_key, status
    FROM {{ ref('dim_delta_table_health_status') }}
),

dim_op AS (
    SELECT operation_type_key, operation
    FROM {{ ref('dim_delta_table_operation_type') }}
),

fact AS (
    SELECT
        sha2(concat_ws('|', deduped.table_fqn, deduped.snapshot_date, cast(deduped.evaluation_timestamp AS string)), 256) AS health_key,
        dim_tbl.table_key,
        deduped.date_key,
        hs_overall.health_status_key AS overall_status_key,
        hs_fresh.health_status_key AS freshness_status_key,
        hs_comp.health_status_key AS completeness_status_key,
        dim_op.operation_type_key AS most_common_operation_key,
        deduped.evaluation_timestamp,
        deduped.last_commit_timestamp,
        deduped.predicted_next_commit,
        deduped.median_commit_interval_seconds,
        deduped.p95_commit_interval_seconds,
        deduped.commits_in_last_24h,
        deduped.commits_in_last_7d,
        deduped.days_since_last_commit,
        deduped.daily_row_count_actual,
        deduped.daily_row_count_min_expected,
        deduped.daily_row_count_max_expected,
        deduped.latest_version,
        deduped.snapshot_date,
        deduped.optimize_count_7d,
        deduped.vacuum_count_7d,
        current_timestamp() AS dbt_loaded_at,
        date_format(current_timestamp(), 'yyyyMMdd') AS event_year_date

    FROM deduped
    INNER JOIN dim_tbl
        ON
            deduped.table_fqn = dim_tbl.table_fqn
            AND deduped.evaluation_timestamp >= dim_tbl.row_effective_start
            AND deduped.evaluation_timestamp < coalesce(dim_tbl.row_effective_end, cast('9999-12-31' AS timestamp))
    LEFT JOIN dim_hs AS hs_overall ON deduped.overall_status = hs_overall.status
    LEFT JOIN dim_hs AS hs_fresh ON deduped.freshness_status = hs_fresh.status
    LEFT JOIN dim_hs AS hs_comp ON deduped.completeness_status = hs_comp.status
    LEFT JOIN dim_op ON deduped.most_common_operation = dim_op.operation
)

SELECT * FROM fact
{{ fact_not_exists('health_key', 'fact') }}
