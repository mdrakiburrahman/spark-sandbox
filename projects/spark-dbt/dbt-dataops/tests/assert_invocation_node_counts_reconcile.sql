-- Custom SQL test: cross-fact reconciliation — fct_dbt_invocation.total_nodes must
-- equal the count of fct_dbt_node_execution rows for the same invocation.
-- Returns offending invocations (test passes only when empty).

WITH node_counts AS (
    SELECT
        invocation_id,
        count(*) AS node_row_count
    FROM {{ ref('fct_dbt_node_execution') }}
    GROUP BY invocation_id
)

SELECT
    inv.invocation_id,
    inv.total_nodes,
    coalesce(node_counts.node_row_count, 0) AS node_row_count
FROM {{ ref('fct_dbt_invocation') }} AS inv
LEFT JOIN node_counts ON inv.invocation_id = node_counts.invocation_id
WHERE inv.total_nodes <> coalesce(node_counts.node_row_count, 0)
