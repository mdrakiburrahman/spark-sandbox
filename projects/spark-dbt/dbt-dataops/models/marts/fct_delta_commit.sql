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
            PARTITION BY table_fqn, version
            ORDER BY ingested_at DESC
        ) AS _row_num
    FROM {{ ref('stg_delta_commit_history') }}
    {% if is_incremental() %}
    where
        snapshot_date >= (select date_format(max(commit_timestamp), 'yyyyMMdd') from {{ this }})
        and commit_timestamp > (select max(commit_timestamp) from {{ this }})
    {% endif %}
),

deduped AS (
    SELECT * FROM src WHERE _row_num = 1
),

dim_tbl AS (
    SELECT __pk AS table_key, table_fqn, row_effective_start, row_effective_end
    FROM {{ ref('dim_delta_table') }}
),

dim_op AS (
    SELECT operation_type_key, operation
    FROM {{ ref('dim_delta_table_operation_type') }}
),

fact AS (
    SELECT
        sha2(concat_ws('|', deduped.table_fqn, cast(deduped.version AS string)), 256) AS commit_key,
        dim_tbl.table_key,
        dim_op.operation_type_key,
        deduped.date_key,
        deduped.version,
        deduped.commit_timestamp,
        deduped.num_output_rows,
        deduped.num_added_files,
        deduped.num_removed_files,
        deduped.num_output_bytes,
        deduped.execution_time_ms,
        deduped.is_blind_append,
        deduped.ingested_at,
        current_timestamp() AS dbt_loaded_at,
        date_format(current_timestamp(), 'yyyyMMdd') AS event_year_date

    FROM deduped
    INNER JOIN dim_tbl
        ON
            deduped.table_fqn = dim_tbl.table_fqn
            AND deduped.commit_timestamp >= dim_tbl.row_effective_start
            AND deduped.commit_timestamp < coalesce(dim_tbl.row_effective_end, cast('9999-12-31' AS timestamp))
    LEFT JOIN dim_op ON deduped.operation = dim_op.operation
)

SELECT * FROM fact
{{ fact_not_exists('commit_key', 'fact') }}
