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

WITH raw_snapshots AS (
    SELECT
        *,
        row_number() OVER (
            PARTITION BY table_fqn, snapshot_date
            ORDER BY ingested_at DESC
        ) AS _row_num
    FROM {{ source('dataops_inventory', 'table_snapshots') }}
    {% if is_incremental() %}
    where
        snapshot_date >= (select max(date_key) from {{ this }})
        and ingested_at > (select max(ingested_at) from {{ this }})
    {% endif %}
),

src AS (
    SELECT * FROM raw_snapshots WHERE _row_num = 1
),

dim_tbl AS (
    SELECT __pk AS table_key, table_fqn, row_effective_start, row_effective_end
    FROM {{ ref('dim_delta_table') }}
),

fact AS (
    SELECT
        sha2(concat_ws('|', src.table_fqn, src.snapshot_date), 256) AS storage_key,
        dim_tbl.table_key,
        src.snapshot_date AS date_key,
        src.num_files,
        src.size_in_bytes,
        src.size_in_gb,
        src.created_at,
        src.last_modified,
        src.ingested_at,
        current_timestamp() AS dbt_loaded_at,
        date_format(current_timestamp(), 'yyyyMMdd') AS event_year_date

    FROM src
    INNER JOIN dim_tbl
        ON
            src.table_fqn = dim_tbl.table_fqn
            AND src.ingested_at >= dim_tbl.row_effective_start
            AND src.ingested_at < coalesce(dim_tbl.row_effective_end, cast('9999-12-31' AS timestamp))
)

SELECT * FROM fact
{{ fact_not_exists('storage_key', 'fact') }}
