{{
    config(
        materialized='table',
        file_format='delta',
        location_root='none'
    )
}}

WITH observed AS (
    SELECT DISTINCT test_type
    FROM {{ ref('stg_dbt_node_executions') }}
    WHERE test_type IS NOT NULL
),

enrichment AS (
    SELECT
        test_type,
        test_family,
        package
    FROM (
        VALUES
        ('not_null', 'completeness', 'dbt_core'),
        ('unique', 'uniqueness', 'dbt_core'),
        ('relationships', 'referential_integrity', 'dbt_core'),
        ('accepted_values', 'validity', 'dbt_core'),
        ('unique_combination_of_columns', 'uniqueness', 'dbt_utils'),
        ('expression_is_true', 'validity', 'dbt_utils'),
        ('accepted_range', 'validity', 'dbt_utils'),
        ('not_null_proportion', 'completeness', 'dbt_utils'),
        ('equal_rowcount', 'consistency', 'dbt_utils'),
        ('fewer_rows_than', 'consistency', 'dbt_utils'),
        ('mutually_exclusive_ranges', 'validity', 'dbt_utils'),
        ('has_rows', 'completeness', 'custom'),
        ('has_unknown_member', 'referential_integrity', 'custom')
    ) AS t (test_type, test_family, package)
),

joined AS (
    SELECT
        observed.test_type,
        coalesce(enrichment.test_family, 'other') AS test_family,
        coalesce(enrichment.package, 'custom') AS package
    FROM observed
    LEFT JOIN enrichment ON observed.test_type = enrichment.test_type
),

final AS (
    SELECT
        sha2(test_type, 256) AS test_type_key,
        test_type,
        test_family,
        package,
        TRUE AS is_generic
    FROM joined

    UNION ALL

    SELECT
        '-1' AS test_type_key,
        'Unknown' AS test_type,
        'unknown' AS test_family,
        'unknown' AS package,
        FALSE AS is_generic
)

SELECT * FROM final
