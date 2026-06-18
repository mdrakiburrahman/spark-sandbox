WITH nodes AS (
    SELECT
        invocation_id,
        unique_id,
        project,
        run_date_key,
        depends_on_nodes
    FROM {{ ref('stg_dbt_node_executions') }}
    WHERE depends_on_nodes IS NOT NULL AND size(depends_on_nodes) > 0
),

edges AS (
    SELECT
        invocation_id,
        unique_id AS node_unique_id,
        explode(depends_on_nodes) AS depends_on_unique_id,
        project,
        run_date_key
    FROM nodes
)

SELECT
    invocation_id,
    node_unique_id,
    depends_on_unique_id,
    project,
    run_date_key
FROM edges
WHERE depends_on_unique_id IS NOT NULL
