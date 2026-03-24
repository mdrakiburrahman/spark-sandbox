{{
    config(
        materialized='view'
    )
}}

with source as (
    select * from {{ source('dataops_inventory', 'openlineage') }}
    where eventType = 'COMPLETE'
),

lineage_edges as (
    select distinct
        inputs_namespace as source_namespace,
        inputs_name as source_name,
        outputs_namespace as target_namespace,
        outputs_name as target_name,
        job_name,
        job_namespace,
        eventTime as event_timestamp,
        event_year_date,
        event_year_date as date_key
    from source
    where inputs_name is not null
      and outputs_name is not null
      and inputs_name != ''
      and outputs_name != ''
)

select * from lineage_edges
