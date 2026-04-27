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

with raw_snapshots as (
    select
        *,
        row_number() over (
            partition by table_fqn, snapshot_date
            order by ingested_at desc
        ) as _row_num
    from {{ source('dataops_inventory', 'table_snapshots') }}
    {% if is_incremental() %}
    where
        snapshot_date >= (select max(date_key) from {{ this }})
        and ingested_at > (select max(ingested_at) from {{ this }})
    {% endif %}
),

src as (
    select * from raw_snapshots where _row_num = 1
),

dim_tbl as (
    select __pk as table_key, table_fqn, row_effective_start, row_effective_end
    from {{ ref('dim_delta_table') }}
),

fact as (
    select
        sha2(concat_ws('|', src.table_fqn, src.snapshot_date), 256) as storage_key,
        dim_tbl.table_key,
        src.snapshot_date as date_key,
        src.num_files,
        src.size_in_bytes,
        src.size_in_gb,
        src.created_at,
        src.last_modified,
        src.ingested_at,
        current_timestamp() as dbt_loaded_at,
        date_format(current_timestamp(), 'yyyyMMdd') as event_year_date

    from src
    inner join dim_tbl
        on src.table_fqn = dim_tbl.table_fqn
        and src.ingested_at >= dim_tbl.row_effective_start
        and src.ingested_at < coalesce(dim_tbl.row_effective_end, cast('9999-12-31' as timestamp))
)

select * from fact
{{ fact_not_exists('storage_key', 'fact') }}
