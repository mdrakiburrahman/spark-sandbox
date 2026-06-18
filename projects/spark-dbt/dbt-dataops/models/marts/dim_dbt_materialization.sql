{{
    config(
        materialized='table',
        file_format='delta',
        location_root='none'
    )
}}

WITH members AS (
    SELECT
        materialized,
        storage_class,
        cast(is_persisted AS boolean) AS is_persisted,
        cast(is_rebuilt_each_run AS boolean) AS is_rebuilt_each_run,
        description
    FROM (
        VALUES
        ('view', 'view', TRUE, TRUE, 'A logical view recreated on every run'),
        ('table', 'table', TRUE, TRUE, 'A physical table fully rebuilt on every run'),
        ('incremental', 'table', TRUE, FALSE, 'A physical table appended/merged incrementally'),
        ('snapshot', 'table', TRUE, FALSE, 'An SCD2 history table updated in place'),
        ('seed', 'table', TRUE, TRUE, 'A table loaded from a CSV seed'),
        ('materialized_view', 'view', TRUE, FALSE, 'A materialized view refreshed by the engine'),
        ('ephemeral', 'none', FALSE, TRUE, 'An inlined CTE that is never persisted'),
        ('test', 'none', FALSE, TRUE, 'A transient test query, not persisted'),
        ('unit_test', 'none', FALSE, TRUE, 'A transient unit-test query, not persisted'),
        ('operation', 'none', FALSE, TRUE, 'A hook or operation that persists no relation')
    ) AS t (materialized, storage_class, is_persisted, is_rebuilt_each_run, description)
),

final AS (
    SELECT
        sha2(materialized, 256) AS materialization_key,
        materialized,
        storage_class,
        is_persisted,
        is_rebuilt_each_run,
        description
    FROM members

    UNION ALL

    SELECT
        '-1' AS materialization_key,
        'Unknown' AS materialized,
        'unknown' AS storage_class,
        FALSE AS is_persisted,
        FALSE AS is_rebuilt_each_run,
        'Unknown member for unresolved materializations' AS description
)

SELECT * FROM final
