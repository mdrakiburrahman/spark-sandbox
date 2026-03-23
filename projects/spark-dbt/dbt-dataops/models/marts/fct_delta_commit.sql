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
    select * from {{ ref('stg_delta_commit_history') }}
    {% if is_incremental() %}
    where
        snapshot_date >= (select date_format(max(commit_timestamp), 'yyyyMMdd') from {{ this }})
        and commit_timestamp > (select max(commit_timestamp) from {{ this }})
    {% endif %}
),

dim_tbl as (
    select __pk as table_key, table_fqn, row_effective_start, row_effective_end
    from {{ ref('dim_delta_table') }}
),

dim_op as (
    select operation_type_key, operation
    from {{ ref('dim_delta_table_operation_type') }}
)

select
    sha2(concat_ws('|', src.table_fqn, cast(src.version as string)), 256) as commit_key,
    dim_tbl.table_key,
    dim_op.operation_type_key,
    src.date_key,
    src.version,
    src.commit_timestamp,
    src.num_output_rows,
    src.num_added_files,
    src.num_removed_files,
    src.num_output_bytes,
    src.execution_time_ms,
    src.is_blind_append,
    src.ingested_at

from src
left join dim_tbl
    on src.table_fqn = dim_tbl.table_fqn
    and src.commit_timestamp >= dim_tbl.row_effective_start
    and src.commit_timestamp < coalesce(dim_tbl.row_effective_end, cast('9999-12-31' as timestamp))
left join dim_op on src.operation = dim_op.operation
