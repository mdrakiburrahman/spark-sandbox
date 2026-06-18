-- Custom SQL test: the denormalised OBT must not fan out or drop rows relative to
-- its base fact — row counts must match exactly (dimension joins are 1:1 on unique
-- surrogate keys). Returns a row only on mismatch (test passes only when empty).

WITH counts AS (
    SELECT
        (SELECT count(*) FROM {{ ref('obt_dbt_node_execution') }}) AS obt_rows,
        (SELECT count(*) FROM {{ ref('fct_dbt_node_execution') }}) AS fact_rows
)

SELECT
    obt_rows,
    fact_rows
FROM counts
WHERE obt_rows <> fact_rows
