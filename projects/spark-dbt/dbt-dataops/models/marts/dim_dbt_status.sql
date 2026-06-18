{{
    config(
        materialized='table',
        file_format='delta',
        location_root='none'
    )
}}

WITH members AS (
    SELECT
        status,
        status_group,
        cast(is_passing AS boolean) AS is_passing,
        cast(is_failure AS boolean) AS is_failure,
        cast(severity_rank AS int) AS severity_rank,
        description
    FROM (
        VALUES
        ('success', 'passed', TRUE, FALSE, 0, 'Model, seed, snapshot, or operation completed successfully'),
        ('pass', 'passed', TRUE, FALSE, 0, 'Data test passed'),
        ('warn', 'warned', FALSE, FALSE, 1, 'Data test raised a warning (soft failure)'),
        ('skipped', 'skipped', FALSE, FALSE, 2, 'Node skipped because an upstream node failed'),
        ('fail', 'failed', FALSE, TRUE, 3, 'Data test failed'),
        ('error', 'failed', FALSE, TRUE, 3, 'Node raised an execution error'),
        ('runtime error', 'failed', FALSE, TRUE, 3, 'Node raised a runtime error')
    ) AS t (status, status_group, is_passing, is_failure, severity_rank, description)
),

final AS (
    SELECT
        sha2(status, 256) AS status_key,
        status,
        status_group,
        is_passing,
        is_failure,
        severity_rank,
        description
    FROM members

    UNION ALL

    SELECT
        '-1' AS status_key,
        'Unknown' AS status,
        'unknown' AS status_group,
        FALSE AS is_passing,
        FALSE AS is_failure,
        -1 AS severity_rank,
        'Unknown member for unresolved statuses' AS description
)

SELECT * FROM final
