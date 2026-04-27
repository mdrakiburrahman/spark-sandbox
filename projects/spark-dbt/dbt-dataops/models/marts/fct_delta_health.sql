{{
    config(
        materialized='incremental',
        incremental_strategy='append',
        file_format='delta',
        location_root='none',
        on_schema_change='append_new_columns',
        partition_by=['event_year_date']
    )
}}

with src as (
    select
        *,
        row_number() over (
            partition by table_fqn, snapshot_date, evaluation_timestamp
            order by evaluation_timestamp desc
        ) as _row_num
    from {{ ref('stg_delta_kpi_results') }}
    {% if is_incremental() %}
    where
        date_key >= (select max(date_key) from {{ this }})
        and evaluation_timestamp > (select max(evaluation_timestamp) from {{ this }})
    {% endif %}
),

deduped as (
    select * from src where _row_num = 1
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
),

fact as (
    select
        sha2(concat_ws('|', deduped.table_fqn, deduped.snapshot_date, cast(deduped.evaluation_timestamp as string)), 256) as health_key,
        dim_tbl.table_key,
        deduped.date_key,
        hs_overall.health_status_key as overall_status_key,
        hs_fresh.health_status_key as freshness_status_key,
        hs_comp.health_status_key as completeness_status_key,
        dim_op.operation_type_key as most_common_operation_key,
        deduped.evaluation_timestamp,
        deduped.last_commit_timestamp,
        deduped.predicted_next_commit,
        deduped.median_commit_interval_seconds,
        deduped.p95_commit_interval_seconds,
        deduped.commits_in_last_24h,
        deduped.commits_in_last_7d,
        deduped.days_since_last_commit,
        deduped.daily_row_count_actual,
        deduped.daily_row_count_min_expected,
        deduped.daily_row_count_max_expected,
        deduped.latest_version,
        deduped.snapshot_date,
        deduped.optimize_count_7d,
        deduped.vacuum_count_7d,
        current_timestamp() as dbt_loaded_at,
        date_format(current_timestamp(), 'yyyyMMdd') as event_year_date

    from deduped
    inner join dim_tbl
        on deduped.table_fqn = dim_tbl.table_fqn
        and deduped.evaluation_timestamp >= dim_tbl.row_effective_start
        and deduped.evaluation_timestamp < coalesce(dim_tbl.row_effective_end, cast('9999-12-31' as timestamp))
    left join dim_hs as hs_overall on deduped.overall_status = hs_overall.status
    left join dim_hs as hs_fresh on deduped.freshness_status = hs_fresh.status
    left join dim_hs as hs_comp on deduped.completeness_status = hs_comp.status
    left join dim_op on deduped.most_common_operation = dim_op.operation
)

select * from fact
{{ fact_not_exists('health_key', 'fact') }}
