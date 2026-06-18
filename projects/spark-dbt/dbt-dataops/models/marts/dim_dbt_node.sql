{{
    config(
        materialized='table',
        file_format='delta',
        location_root='none'
    )
}}

{#
    Type 1 dimension: one row per dbt node (unique_id), latest attributes win.
    Node attributes (materialized, path, layer) rarely change; SCD2 history via a
    snapshot is a documented future enhancement.
#}

WITH ranked AS (
    SELECT
        *,
        row_number() OVER (
            PARTITION BY unique_id
            ORDER BY generated_at DESC, execute_completed_at DESC
        ) AS _rn
    FROM {{ ref('stg_dbt_node_executions') }}
),

latest AS (
    SELECT * FROM ranked WHERE _rn = 1
),

final AS (
    SELECT
        sha2(unique_id, 256) AS node_key,
        unique_id,
        project,
        resource_type,
        package_name,
        node_name,
        alias,
        database_name,
        schema_name,
        relation_name,
        original_file_path,
        materialized,
        node_layer,
        test_type,
        tested_column,
        is_test
    FROM latest

    UNION ALL

    SELECT
        '-1' AS node_key,
        'Unknown' AS unique_id,
        'Unknown' AS project,
        'Unknown' AS resource_type,
        cast(NULL AS string) AS package_name,
        'Unknown' AS node_name,
        cast(NULL AS string) AS alias,
        cast(NULL AS string) AS database_name,
        cast(NULL AS string) AS schema_name,
        cast(NULL AS string) AS relation_name,
        cast(NULL AS string) AS original_file_path,
        cast(NULL AS string) AS materialized,
        'unknown' AS node_layer,
        cast(NULL AS string) AS test_type,
        cast(NULL AS string) AS tested_column,
        FALSE AS is_test
)

SELECT * FROM final
