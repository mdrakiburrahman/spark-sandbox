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
            partition by table_fqn, version
            order by ingested_at desc
        ) as _row_num
    from {{ ref('stg_delta_commit_history') }}
    {% if is_incremental() %}
    where
        snapshot_date >= (select date_format(max(commit_timestamp), 'yyyyMMdd') from {{ this }})
        and commit_timestamp > (select max(commit_timestamp) from {{ this }})
    {% endif %}
),

deduped as (
    select * from src where _row_num = 1
),

dim_tbl as (
    select __pk as table_key, table_fqn, row_effective_start, row_effective_end
    from {{ ref('dim_delta_table') }}
),

dim_op as (
    select operation_type_key, operation
    from {{ ref('dim_delta_table_operation_type') }}
),

fact as (
    select
        sha2(concat_ws('|', deduped.table_fqn, cast(deduped.version as string)), 256) as commit_key,
        dim_tbl.table_key,
        dim_op.operation_type_key,
        deduped.date_key,
        deduped.version,
        deduped.commit_timestamp,
        deduped.num_output_rows,
        deduped.num_added_files,
        deduped.num_removed_files,
        deduped.num_output_bytes,
        deduped.execution_time_ms,
        deduped.is_blind_append,
        deduped.ingested_at,
        current_timestamp() as dbt_loaded_at,
        date_format(current_timestamp(), 'yyyyMMdd') as event_year_date

    from deduped
    inner join dim_tbl
        on deduped.table_fqn = dim_tbl.table_fqn
        and deduped.commit_timestamp >= dim_tbl.row_effective_start
        and deduped.commit_timestamp < coalesce(dim_tbl.row_effective_end, cast('9999-12-31' as timestamp))
    left join dim_op on deduped.operation = dim_op.operation
)

select * from fact
{{ fact_not_exists('commit_key', 'fact') }}
