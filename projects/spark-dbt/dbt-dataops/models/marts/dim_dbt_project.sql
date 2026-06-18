{{
    config(
        materialized='table',
        file_format='delta',
        location_root='none'
    )
}}

WITH observed AS (
    SELECT DISTINCT project
    FROM {{ ref('stg_dbt_node_executions') }}
    WHERE project IS NOT NULL
),

enrichment AS (
    SELECT
        project,
        project_domain,
        project_description,
        cast(is_demo AS boolean) AS is_demo
    FROM (
        VALUES
        ('dbt-adventureworks', 'adventureworks', 'Kimball STAR demo over AdventureWorks', TRUE),
        ('dbt-dataops', 'dataops', 'Delta Lake KPI + dbt observability warehouse', TRUE),
        ('dbt-jaffle-shop', 'jaffle-shop', 'Jaffle Shop toolchain smoke test', TRUE),
        ('dbt-reddit', 'reddit', 'Reddit ETL analytics warehouse', TRUE)
    ) AS t (project, project_domain, project_description, is_demo)
),

joined AS (
    SELECT
        observed.project,
        coalesce(enrichment.project_domain, regexp_replace(observed.project, '^dbt-', '')) AS project_domain,
        coalesce(enrichment.project_description, 'Unclassified dbt project') AS project_description,
        coalesce(enrichment.is_demo, FALSE) AS is_demo
    FROM observed
    LEFT JOIN enrichment ON observed.project = enrichment.project
),

final AS (
    SELECT
        sha2(project, 256) AS project_key,
        project,
        project_domain,
        project_description,
        is_demo
    FROM joined

    UNION ALL

    SELECT
        '-1' AS project_key,
        'Unknown' AS project,
        'unknown' AS project_domain,
        'Unknown member for unresolved projects' AS project_description,
        FALSE AS is_demo
)

SELECT * FROM final
