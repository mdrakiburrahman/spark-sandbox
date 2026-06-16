{{
    config(
        materialized='view'
    )
}}

WITH source AS (
    SELECT * FROM {{ source('dataops_inventory', 'openlineage') }}
    WHERE eventtype = 'COMPLETE'
),

lineage_edges AS (
    SELECT DISTINCT
        inputs_namespace AS source_namespace,
        inputs_name AS source_name,
        outputs_namespace AS target_namespace,
        outputs_name AS target_name,
        job_name,
        job_namespace,
        eventtime AS event_timestamp,
        event_year_date,
        event_year_date AS date_key
    FROM source
    WHERE
        inputs_name IS NOT NULL
        AND outputs_name IS NOT NULL
        AND inputs_name != ''
        AND outputs_name != ''
)

SELECT * FROM lineage_edges
