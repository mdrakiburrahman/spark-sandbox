WITH source AS (
    SELECT * FROM {{ source('dataops_inventory', 'table_snapshots') }}
),

ranked AS (
    SELECT
        *,
        row_number() OVER (
            PARTITION BY table_fqn
            ORDER BY snapshot_date DESC, ingested_at DESC
        ) AS _row_num
    FROM source
),

latest AS (
    SELECT * FROM ranked WHERE _row_num = 1
),

cleaned AS (
    SELECT
        table_fqn,
        database_name,
        table_name,
        table_id,
        location,
        format,
        cast(partition_columns AS string) AS partition_columns,
        cast(clustering_columns AS string) AS clustering_columns,
        cast(table_properties AS string) AS table_properties,
        min_reader_version,
        min_writer_version,
        num_files,
        size_in_bytes,
        size_in_gb,
        created_at,
        last_modified,
        ingested_at,
        snapshot_date,
        snapshot_date AS date_key,

        sha2(concat_ws(
            '|',
            coalesce(cast(clustering_columns AS string), ''),
            coalesce(cast(table_properties AS string), ''),
            coalesce(cast(min_reader_version AS string), ''),
            coalesce(cast(min_writer_version AS string), '')
        ), 256) AS __scd2_hash,

        sha2(concat_ws(
            '|',
            coalesce(table_id, ''),
            coalesce(location, ''),
            coalesce(format, ''),
            coalesce(cast(partition_columns AS string), '')
        ), 256) AS __scd1_hash,

        current_date() AS __merge_effective_date,
        current_timestamp() AS __merge_ingest_time

    FROM latest
)

SELECT * FROM cleaned
