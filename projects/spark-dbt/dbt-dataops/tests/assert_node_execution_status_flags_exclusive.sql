-- Custom SQL test: the additive status flags must be mutually exclusive — a node
-- execution has exactly one status, so at most one flag may be set.
-- Returns offending rows (test passes only when empty).

SELECT
    node_execution_key,
    is_success,
    is_error,
    is_skipped,
    is_pass,
    is_fail,
    is_warn
FROM {{ ref('fct_dbt_node_execution') }}
WHERE (is_success + is_error + is_skipped + is_pass + is_fail + is_warn) > 1
