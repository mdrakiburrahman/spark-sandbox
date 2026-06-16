{{
    config(
        materialized='table',
        file_format='delta',
        location_root='none'
    )
}}

WITH snapshot_data AS (
    SELECT * FROM {{ ref('snap_dim_delta_table') }}
),

-- Propagate latest SCD1 column values across all historical versions
-- This implements Type 1 behavior: the latest value overwrites all versions
with_scd1_propagation AS (
    SELECT
        -- Surrogate key: unique per SCD2 version
        sha2(concat_ws(
            '|',
            table_fqn,
            cast(dbt_valid_from AS string)
        ), 256) AS __pk,

        -- Business key
        table_fqn,
        database_name,
        table_name,

        -- SCD1 columns: propagate latest value across all versions
        last_value(table_id) OVER (
            PARTITION BY table_fqn
            ORDER BY dbt_valid_from
            ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
        ) AS table_id,
        last_value(location) OVER (
            PARTITION BY table_fqn
            ORDER BY dbt_valid_from
            ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
        ) AS location,
        last_value(format) OVER (
            PARTITION BY table_fqn
            ORDER BY dbt_valid_from
            ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
        ) AS format,
        last_value(partition_columns) OVER (
            PARTITION BY table_fqn
            ORDER BY dbt_valid_from
            ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
        ) AS partition_columns,

        -- SCD2 columns: version-specific (historical values preserved)
        clustering_columns,
        table_properties,
        min_reader_version,
        min_writer_version,

        -- Hash columns
        __scd2_hash,
        __scd1_hash,
        __merge_effective_date,

        -- SCD2 tracking columns
        dbt_valid_from AS row_effective_start,
        dbt_valid_to AS row_effective_end,
        CASE WHEN dbt_valid_to IS NULL THEN TRUE ELSE FALSE END AS is_row_effective,
        dbt_scd_id AS __scd_id,
        dbt_updated_at AS __merge_ingest_time

    FROM snapshot_data
)

SELECT * FROM with_scd1_propagation
