{{
    config(
        materialized='table',
        file_format='delta',
        location_root='none'
    )
}}

WITH members AS (
    SELECT
        resource_type,
        resource_category,
        cast(is_executable AS boolean) AS is_executable,
        cast(is_test AS boolean) AS is_test,
        cast(is_data AS boolean) AS is_data,
        description
    FROM (
        VALUES
        ('model', 'transformation', TRUE, FALSE, FALSE, 'A SQL transformation materialized as a relation'),
        ('snapshot', 'transformation', TRUE, FALSE, FALSE, 'An SCD2 snapshot capturing slowly changing history'),
        ('seed', 'data', FALSE, FALSE, TRUE, 'A CSV file loaded as a table'),
        ('test', 'test', TRUE, TRUE, FALSE, 'A data test asserting a quality constraint'),
        ('unit_test', 'test', TRUE, TRUE, FALSE, 'A unit test validating model logic with mock inputs'),
        ('operation', 'maintenance', TRUE, FALSE, FALSE, 'A hook or run-operation macro invocation'),
        ('analysis', 'documentation', FALSE, FALSE, FALSE, 'A compiled-but-not-run analytical query'),
        ('source', 'data', FALSE, FALSE, TRUE, 'An externally managed source relation'),
        ('exposure', 'documentation', FALSE, FALSE, FALSE, 'A downstream consumer of dbt models'),
        ('metric', 'semantic', FALSE, FALSE, FALSE, 'A semantic-layer metric definition')
    ) AS t (resource_type, resource_category, is_executable, is_test, is_data, description)
),

final AS (
    SELECT
        sha2(resource_type, 256) AS resource_type_key,
        resource_type,
        resource_category,
        is_executable,
        is_test,
        is_data,
        description
    FROM members

    UNION ALL

    SELECT
        '-1' AS resource_type_key,
        'Unknown' AS resource_type,
        'unknown' AS resource_category,
        FALSE AS is_executable,
        FALSE AS is_test,
        FALSE AS is_data,
        'Unknown member for unresolved resource types' AS description
)

SELECT * FROM final
