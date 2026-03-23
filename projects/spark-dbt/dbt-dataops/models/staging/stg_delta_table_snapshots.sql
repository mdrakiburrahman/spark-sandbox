with source as (
    select * from {{ source('dataops_inventory', 'table_snapshots') }}
),

ranked as (
    select
        *,
        row_number() over (
            partition by table_fqn
            order by snapshot_date desc, ingested_at desc
        ) as _row_num
    from source
),

latest as (
    select * from ranked where _row_num = 1
),

cleaned as (
    select
        table_fqn,
        database_name,
        table_name,
        table_id,
        location,
        format,
        cast(partition_columns as string) as partition_columns,
        cast(clustering_columns as string) as clustering_columns,
        cast(table_properties as string) as table_properties,
        min_reader_version,
        min_writer_version,
        num_files,
        size_in_bytes,
        size_in_gb,
        created_at,
        last_modified,
        ingested_at,
        snapshot_date,
        snapshot_date as date_key,

        sha2(concat_ws('|',
            coalesce(cast(clustering_columns as string), ''),
            coalesce(cast(table_properties as string), ''),
            coalesce(cast(min_reader_version as string), ''),
            coalesce(cast(min_writer_version as string), '')
        ), 256) as __scd2_hash,

        sha2(concat_ws('|',
            coalesce(table_id, ''),
            coalesce(location, ''),
            coalesce(format, ''),
            coalesce(cast(partition_columns as string), '')
        ), 256) as __scd1_hash,

        current_date() as __merge_effective_date,
        current_timestamp() as __merge_ingest_time

    from latest
)

select * from cleaned
