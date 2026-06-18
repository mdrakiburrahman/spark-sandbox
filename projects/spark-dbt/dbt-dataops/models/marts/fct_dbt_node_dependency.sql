{{
    config(
        materialized='table',
        file_format='delta',
        location_root='none',
        partition_by=['event_year_date']
    )
}}

-- Grain: one edge per (node_unique_id, depends_on_unique_id) for the CURRENT dbt
-- DAG (the latest invocation per project). Rebuilt in full each run.

{#
    A dependency may point at a node that never executed on its own (e.g. a
    source or an ephemeral node), so depends_on_node_key resolves to the -1
    unknown member rather than dropping the edge.
#}

WITH latest_inv AS (
    SELECT project, invocation_id
    FROM (
        SELECT
            project,
            invocation_id,
            row_number() OVER (
                PARTITION BY project ORDER BY generated_at DESC
            ) AS _rn
        FROM (
            SELECT DISTINCT project, invocation_id, generated_at
            FROM {{ ref('stg_dbt_node_executions') }}
        )
    )
    WHERE _rn = 1
),

edges AS (
    SELECT DISTINCT
        dep.project,
        dep.node_unique_id,
        dep.depends_on_unique_id,
        dep.run_date_key
    FROM {{ ref('stg_dbt_node_dependency') }} AS dep
    INNER JOIN latest_inv ON dep.invocation_id = latest_inv.invocation_id
),

dim_node AS (
    SELECT node_key, unique_id FROM {{ ref('dim_dbt_node') }}
),

dim_proj AS (
    SELECT project_key, project FROM {{ ref('dim_dbt_project') }}
),

fact AS (
    SELECT
        sha2(concat_ws('|', edges.node_unique_id, edges.depends_on_unique_id), 256) AS dependency_key,

        -- Foreign keys
        coalesce(parent.node_key, '-1') AS node_key,
        coalesce(child.node_key, '-1') AS depends_on_node_key,
        coalesce(dim_proj.project_key, '-1') AS project_key,
        edges.run_date_key AS date_key,

        -- Degenerate dimensions
        edges.node_unique_id,
        edges.depends_on_unique_id,

        -- Audit + partition
        current_timestamp() AS dbt_loaded_at,
        date_format(current_timestamp(), 'yyyyMMdd') AS event_year_date

    FROM edges
    LEFT JOIN dim_node AS parent ON edges.node_unique_id = parent.unique_id
    LEFT JOIN dim_node AS child ON edges.depends_on_unique_id = child.unique_id
    LEFT JOIN dim_proj ON edges.project = dim_proj.project
)

SELECT * FROM fact
