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
    select * from {{ ref('stg_delta_lineage') }}
    {% if is_incremental() %}
    where
        event_year_date >= (select date_format(max(last_seen_timestamp), 'yyyyMMdd') from {{ this }})
        and event_timestamp > (select max(last_seen_timestamp) from {{ this }})
    {% endif %}
),

daily_edges as (
    select
        source_name,
        target_name,
        job_name,
        date_key,
        min(event_timestamp) as first_seen_timestamp,
        max(event_timestamp) as last_seen_timestamp,
        count(*) as event_count
    from src
    group by
        source_name, target_name,
        job_name,
        date_key
),

dim_tbl as (
    select __pk as table_key, table_fqn, row_effective_start, row_effective_end
    from {{ ref('dim_delta_table') }}
)

select
    sha2(concat_ws('|',
        de.source_name, de.target_name,
        de.job_name, de.date_key
    ), 256) as lineage_key,
    src_tbl.table_key as source_table_key,
    tgt_tbl.table_key as target_table_key,
    de.date_key,
    de.first_seen_timestamp,
    de.last_seen_timestamp,
    de.event_count

from daily_edges de
left join dim_tbl as src_tbl
    on (de.source_name like concat('%', replace(src_tbl.table_fqn, '.', '/'), '%')
        or de.source_name like concat('%', src_tbl.table_fqn, '%'))
    and de.first_seen_timestamp >= src_tbl.row_effective_start
    and de.first_seen_timestamp < coalesce(src_tbl.row_effective_end, cast('9999-12-31' as timestamp))
left join dim_tbl as tgt_tbl
    on (de.target_name like concat('%', replace(tgt_tbl.table_fqn, '.', '/'), '%')
        or de.target_name like concat('%', tgt_tbl.table_fqn, '%'))
    and de.first_seen_timestamp >= tgt_tbl.row_effective_start
    and de.first_seen_timestamp < coalesce(tgt_tbl.row_effective_end, cast('9999-12-31' as timestamp))
