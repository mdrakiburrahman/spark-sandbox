{{
    config(
        materialized='table',
        file_format='delta',
        location_root='none'
    )
}}

-- One-big-table: fully denormalised dbt node executions joined to every
-- conformed dimension. Built for ad-hoc analytics / Power BI DirectLake.
-- Grain matches fct_dbt_node_execution: one row per (invocation_id, unique_id).

with f as (
    select * from {{ ref('fct_dbt_node_execution') }}
),

d_node as (
    select * from {{ ref('dim_dbt_node') }}
),

d_proj as (
    select * from {{ ref('dim_dbt_project') }}
),

d_rt as (
    select * from {{ ref('dim_dbt_resource_type') }}
),

d_status as (
    select * from {{ ref('dim_dbt_status') }}
),

d_mat as (
    select * from {{ ref('dim_dbt_materialization') }}
),

d_tt as (
    select * from {{ ref('dim_dbt_test_type') }}
),

d_date as (
    select * from {{ ref('dim_date') }}
)

select
    {{ dbt_utils.star(from=ref('fct_dbt_node_execution'), relation_alias='f', except=[
        "node_key", "project_key", "resource_type_key", "status_key",
        "materialization_key", "test_type_key", "date_key"
    ]) }},
    {{ dbt_utils.star(from=ref('dim_dbt_node'), relation_alias='d_node', except=["node_key", "unique_id"]) }},
    {{ dbt_utils.star(from=ref('dim_dbt_project'), relation_alias='d_proj', except=["project_key", "project"]) }},
    {{ dbt_utils.star(from=ref('dim_dbt_resource_type'), relation_alias='d_rt', except=["resource_type_key", "resource_type", "is_test", "description"]) }},
    {{ dbt_utils.star(from=ref('dim_dbt_status'), relation_alias='d_status', except=["status_key", "description"]) }},
    {{ dbt_utils.star(from=ref('dim_dbt_materialization'), relation_alias='d_mat', except=["materialization_key", "materialized", "description"]) }},
    {{ dbt_utils.star(from=ref('dim_dbt_test_type'), relation_alias='d_tt', except=["test_type_key", "test_type"]) }},
    {{ dbt_utils.star(from=ref('dim_date'), relation_alias='d_date', except=["date_key"]) }}
from f
left join d_node on f.node_key = d_node.node_key
left join d_proj on f.project_key = d_proj.project_key
left join d_rt on f.resource_type_key = d_rt.resource_type_key
left join d_status on f.status_key = d_status.status_key
left join d_mat on f.materialization_key = d_mat.materialization_key
left join d_tt on f.test_type_key = d_tt.test_type_key
left join d_date on f.date_key = d_date.date_key
