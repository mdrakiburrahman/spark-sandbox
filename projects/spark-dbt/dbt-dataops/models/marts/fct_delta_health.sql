{{
    config(
        materialized='incremental',
        incremental_strategy='append',
        file_format='delta',
        location_root='none',
        on_schema_change='append_new_columns'
    )
}}

with src as (
    select * from {{ ref('stg_delta_kpi_results') }}
    {% if is_incremental() %}
    where
        date_key >= (select max(date_key) from {{ this }})
        and evaluation_timestamp > (select max(evaluation_timestamp) from {{ this }})
    {% endif %}
),

dim_tbl as (
    select __pk as table_key, table_fqn, row_effective_start, row_effective_end
    from {{ ref('dim_delta_table') }}
),

dim_hs as (
    select health_status_key, status
    from {{ ref('dim_delta_table_health_status') }}
),

dim_op as (
    select operation_type_key, operation
    from {{ ref('dim_delta_table_operation_type') }}
)

select
    sha2(concat_ws('|', src.table_fqn, src.snapshot_date, cast(src.evaluation_timestamp as string)), 256) as health_key,
    dim_tbl.table_key,
    src.date_key,
    hs_overall.health_status_key as overall_status_key,
    hs_fresh.health_status_key as freshness_status_key,
    hs_comp.health_status_key as completeness_status_key,
    dim_op.operation_type_key as most_common_operation_key,
    src.evaluation_timestamp,
    src.last_commit_timestamp,
    src.predicted_next_commit,
    src.median_commit_interval_seconds,
    src.p95_commit_interval_seconds,
    src.commits_in_last_24h,
    src.commits_in_last_7d,
    src.days_since_last_commit,
    src.daily_row_count_actual,
    src.daily_row_count_min_expected,
    src.daily_row_count_max_expected,
    src.latest_version,
    src.snapshot_date,
    src.optimize_count_7d,
    src.vacuum_count_7d

from src
left join dim_tbl
    on src.table_fqn = dim_tbl.table_fqn
    and src.evaluation_timestamp >= dim_tbl.row_effective_start
    and src.evaluation_timestamp < coalesce(dim_tbl.row_effective_end, cast('9999-12-31' as timestamp))
left join dim_hs as hs_overall on src.overall_status = hs_overall.status
left join dim_hs as hs_fresh on src.freshness_status = hs_fresh.status
left join dim_hs as hs_comp on src.completeness_status = hs_comp.status
left join dim_op on src.most_common_operation = dim_op.operation
