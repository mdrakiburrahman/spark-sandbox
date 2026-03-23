{{
    config(
        materialized='table',
        file_format='delta',
        location_root='none'
    )
}}

with snapshot_data as (
    select * from {{ ref('snap_dim_delta_table') }}
),

-- Propagate latest SCD1 column values across all historical versions
-- This implements Type 1 behavior: the latest value overwrites all versions
with_scd1_propagation as (
    select
        -- Surrogate key: unique per SCD2 version
        sha2(concat_ws('|',
            table_fqn,
            cast(dbt_valid_from as string)
        ), 256) as __pk,

        -- Business key
        table_fqn,
        database_name,
        table_name,

        -- SCD1 columns: propagate latest value across all versions
        last_value(table_id) over (
            partition by table_fqn
            order by dbt_valid_from
            rows between unbounded preceding and unbounded following
        ) as table_id,
        last_value(location) over (
            partition by table_fqn
            order by dbt_valid_from
            rows between unbounded preceding and unbounded following
        ) as location,
        last_value(format) over (
            partition by table_fqn
            order by dbt_valid_from
            rows between unbounded preceding and unbounded following
        ) as format,
        last_value(partition_columns) over (
            partition by table_fqn
            order by dbt_valid_from
            rows between unbounded preceding and unbounded following
        ) as partition_columns,

        -- SCD2 columns: version-specific (historical values preserved)
        clustering_columns,
        table_properties,
        min_reader_version,
        min_writer_version,

        -- Hash columns
        __scd2_hash,
        __scd1_hash,
        __merge_effective_date,

        -- SCD2 tracking columns (renamed from dbt defaults to our convention)
        dbt_valid_from as row_effective_start,
        dbt_valid_to as row_effective_end,
        case when dbt_valid_to is null then true else false end as is_row_effective,
        dbt_scd_id as __scd_id,
        dbt_updated_at as __merge_ingest_time

    from snapshot_data
)

select * from with_scd1_propagation
