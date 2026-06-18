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

-- Grain: one row per (invocation_id, unique_id) — a single dbt node execution
-- within one dbt invocation.

WITH src AS (
    SELECT * FROM {{ ref('stg_dbt_node_executions') }}
    {% if is_incremental() %}
        WHERE generated_at >= (SELECT max(generated_at) FROM {{ this }})
    {% endif %}
),

dim_node AS (
    SELECT node_key, unique_id FROM {{ ref('dim_dbt_node') }}
),

dim_proj AS (
    SELECT project_key, project FROM {{ ref('dim_dbt_project') }}
),

dim_rt AS (
    SELECT resource_type_key, resource_type FROM {{ ref('dim_dbt_resource_type') }}
),

dim_status AS (
    SELECT status_key, status FROM {{ ref('dim_dbt_status') }}
),

dim_mat AS (
    SELECT materialization_key, materialized FROM {{ ref('dim_dbt_materialization') }}
),

dim_tt AS (
    SELECT test_type_key, test_type FROM {{ ref('dim_dbt_test_type') }}
),

fact AS (
    SELECT
        sha2(concat_ws('|', src.invocation_id, src.unique_id), 256) AS node_execution_key,

        -- Foreign keys (coalesced to the -1 unknown member)
        coalesce(dim_node.node_key, '-1') AS node_key,
        coalesce(dim_proj.project_key, '-1') AS project_key,
        coalesce(dim_rt.resource_type_key, '-1') AS resource_type_key,
        coalesce(dim_status.status_key, '-1') AS status_key,
        coalesce(dim_mat.materialization_key, '-1') AS materialization_key,
        coalesce(dim_tt.test_type_key, '-1') AS test_type_key,
        src.run_date_key AS date_key,

        -- Degenerate dimensions
        src.invocation_id,
        src.unique_id,
        src.command,
        src.thread_id,
        src.dbt_version,

        -- Measures: timing
        src.execution_time,
        src.compile_time,
        src.execute_time,

        -- Measures: adapter-reported (often NULL on the fabricspark adapter)
        src.rows_affected,
        src.failures,

        -- Measures: additive status counters
        CASE WHEN src.is_success THEN 1 ELSE 0 END AS is_success,
        CASE WHEN src.is_error THEN 1 ELSE 0 END AS is_error,
        CASE WHEN src.is_skipped THEN 1 ELSE 0 END AS is_skipped,
        CASE WHEN src.is_pass THEN 1 ELSE 0 END AS is_pass,
        CASE WHEN src.is_fail THEN 1 ELSE 0 END AS is_fail,
        CASE WHEN src.is_warn THEN 1 ELSE 0 END AS is_warn,
        CASE WHEN src.has_failure THEN 1 ELSE 0 END AS has_failure,

        -- Event timestamps
        src.compile_started_at,
        src.execute_completed_at,
        src.generated_at,

        -- Audit + partition
        current_timestamp() AS dbt_loaded_at,
        date_format(current_timestamp(), 'yyyyMMdd') AS event_year_date

    FROM src
    LEFT JOIN dim_node ON src.unique_id = dim_node.unique_id
    LEFT JOIN dim_proj ON src.project = dim_proj.project
    LEFT JOIN dim_rt ON src.resource_type = dim_rt.resource_type
    LEFT JOIN dim_status ON src.status = dim_status.status
    LEFT JOIN dim_mat ON src.materialized = dim_mat.materialized
    LEFT JOIN dim_tt ON src.test_type = dim_tt.test_type
)

SELECT * FROM fact
{{ fact_not_exists('node_execution_key', 'fact') }}
