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

{#
    Lineage edges use fuzzy LIKE matching against dim_delta_table. Source/target
    table names from OpenLineage may not match any known dimension row, so FKs
    are intentionally nullable here (LEFT JOIN preserved by design).
#}

WITH src AS (
    SELECT * FROM {{ ref('stg_delta_lineage') }}
    {% if is_incremental() %}
        WHERE
            event_year_date >= (SELECT date_format(max(last_seen_timestamp), 'yyyyMMdd') FROM {{ this }})
            AND event_timestamp > (SELECT max(last_seen_timestamp) FROM {{ this }})
    {% endif %}
),

daily_edges AS (
    SELECT
        source_name,
        target_name,
        job_name,
        date_key,
        min(event_timestamp) AS first_seen_timestamp,
        max(event_timestamp) AS last_seen_timestamp,
        count(*) AS event_count
    FROM src
    GROUP BY
        source_name, target_name,
        job_name,
        date_key
),

dim_tbl AS (
    SELECT __pk AS table_key, table_fqn, row_effective_start, row_effective_end
    FROM {{ ref('dim_delta_table') }}
),

fact AS (
    SELECT
        sha2(concat_ws(
            '|',
            de.source_name, de.target_name,
            de.job_name, de.date_key
        ), 256) AS lineage_key,
        src_tbl.table_key AS source_table_key,
        tgt_tbl.table_key AS target_table_key,
        de.date_key,
        de.first_seen_timestamp,
        de.last_seen_timestamp,
        de.event_count,
        current_timestamp() AS dbt_loaded_at,
        date_format(current_timestamp(), 'yyyyMMdd') AS event_year_date

    FROM daily_edges de
    LEFT JOIN dim_tbl AS src_tbl
        ON (
            de.source_name LIKE concat('%', replace(src_tbl.table_fqn, '.', '/'), '%')
            OR de.source_name LIKE concat('%', src_tbl.table_fqn, '%')
        )
        AND de.first_seen_timestamp >= src_tbl.row_effective_start
        AND de.first_seen_timestamp < coalesce(src_tbl.row_effective_end, cast('9999-12-31' AS timestamp))
    LEFT JOIN dim_tbl AS tgt_tbl
        ON (
            de.target_name LIKE concat('%', replace(tgt_tbl.table_fqn, '.', '/'), '%')
            OR de.target_name LIKE concat('%', tgt_tbl.table_fqn, '%')
        )
        AND de.first_seen_timestamp >= tgt_tbl.row_effective_start
        AND de.first_seen_timestamp < coalesce(tgt_tbl.row_effective_end, cast('9999-12-31' AS timestamp))
)

SELECT * FROM fact
{{ fact_not_exists('lineage_key', 'fact') }}
