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

-- Grain: one row per invocation_id — a single dbt command run (e.g. one `build`).

WITH src AS (
    SELECT * FROM {{ ref('stg_dbt_node_executions') }}
    {% if is_incremental() %}
        WHERE generated_at >= (SELECT max(generated_at) FROM {{ this }})
    {% endif %}
),

agg AS (
    SELECT
        invocation_id,
        project,
        command,
        dbt_version,
        min(generated_at) AS generated_at,

        count(*) AS total_nodes,
        sum(CASE WHEN resource_type = 'model' THEN 1 ELSE 0 END) AS model_count,
        sum(CASE WHEN resource_type = 'test' THEN 1 ELSE 0 END) AS test_count,
        sum(CASE WHEN resource_type = 'seed' THEN 1 ELSE 0 END) AS seed_count,
        sum(CASE WHEN resource_type = 'snapshot' THEN 1 ELSE 0 END) AS snapshot_count,
        sum(CASE WHEN resource_type = 'operation' THEN 1 ELSE 0 END) AS operation_count,

        sum(CASE WHEN is_success THEN 1 ELSE 0 END) AS success_count,
        sum(CASE WHEN is_error THEN 1 ELSE 0 END) AS error_count,
        sum(CASE WHEN is_skipped THEN 1 ELSE 0 END) AS skipped_count,
        sum(CASE WHEN is_pass THEN 1 ELSE 0 END) AS test_pass_count,
        sum(CASE WHEN is_fail THEN 1 ELSE 0 END) AS test_fail_count,
        sum(CASE WHEN is_warn THEN 1 ELSE 0 END) AS test_warn_count,
        sum(CASE WHEN has_failure THEN 1 ELSE 0 END) AS failure_count,

        sum(execution_time) AS total_execution_time,
        sum(execute_time) AS total_execute_time,
        sum(compile_time) AS total_compile_time,
        avg(execute_time) AS avg_node_execute_time,

        count(DISTINCT thread_id) AS thread_count,
        min(execute_started_at) AS invocation_started_at,
        max(execute_completed_at) AS invocation_completed_at
    FROM src
    GROUP BY invocation_id, project, command, dbt_version
),

dim_proj AS (
    SELECT project_key, project FROM {{ ref('dim_dbt_project') }}
),

fact AS (
    SELECT
        sha2(agg.invocation_id, 256) AS invocation_key,

        -- Foreign keys
        coalesce(dim_proj.project_key, '-1') AS project_key,
        date_format(agg.generated_at, 'yyyyMMdd') AS date_key,

        -- Degenerate dimensions
        agg.invocation_id,
        agg.command,
        agg.dbt_version,

        -- Measures: counts
        agg.total_nodes,
        agg.model_count,
        agg.test_count,
        agg.seed_count,
        agg.snapshot_count,
        agg.operation_count,
        agg.success_count,
        agg.error_count,
        agg.skipped_count,
        agg.test_pass_count,
        agg.test_fail_count,
        agg.test_warn_count,
        agg.failure_count,

        -- Measures: timing
        agg.total_execution_time,
        agg.total_execute_time,
        agg.total_compile_time,
        agg.avg_node_execute_time,
        unix_timestamp(agg.invocation_completed_at) - unix_timestamp(agg.invocation_started_at) AS wall_clock_seconds,
        agg.thread_count,

        -- Measures: derived (non-additive — do not SUM)
        CASE WHEN agg.failure_count > 0 THEN 1 ELSE 0 END AS has_failure,
        round(agg.success_count / nullif(agg.total_nodes, 0), 4) AS success_rate,

        -- Event timestamps
        agg.invocation_started_at,
        agg.invocation_completed_at,
        agg.generated_at,

        -- Audit + partition
        current_timestamp() AS dbt_loaded_at,
        date_format(current_timestamp(), 'yyyyMMdd') AS event_year_date

    FROM agg
    LEFT JOIN dim_proj ON agg.project = dim_proj.project
)

SELECT * FROM fact
{{ fact_not_exists('invocation_key', 'fact') }}
