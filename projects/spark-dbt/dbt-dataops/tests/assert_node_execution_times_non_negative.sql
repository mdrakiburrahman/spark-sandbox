-- Custom SQL test: node-execution timing measures must never be negative.
-- Returns offending rows (test passes only when empty).

SELECT
    node_execution_key,
    execution_time,
    compile_time,
    execute_time
FROM {{ ref('fct_dbt_node_execution') }}
WHERE
    execution_time < 0
    OR compile_time < 0
    OR execute_time < 0
