{{
    config(
        materialized='table',
        file_format='delta',
        location_root='none'
    )
}}

-- One-big-table: fully denormalised dbt invocations joined to project + date.
-- Grain matches fct_dbt_invocation: one row per invocation_id.

with f as (
    select * from {{ ref('fct_dbt_invocation') }}
),

d_proj as (
    select * from {{ ref('dim_dbt_project') }}
),

d_date as (
    select * from {{ ref('dim_date') }}
)

select
    {{ dbt_utils.star(from=ref('fct_dbt_invocation'), relation_alias='f', except=["project_key", "date_key"]) }},
    {{ dbt_utils.star(from=ref('dim_dbt_project'), relation_alias='d_proj', except=["project_key"]) }},
    {{ dbt_utils.star(from=ref('dim_date'), relation_alias='d_date', except=["date_key"]) }}
from f
left join d_proj on f.project_key = d_proj.project_key
left join d_date on f.date_key = d_date.date_key
