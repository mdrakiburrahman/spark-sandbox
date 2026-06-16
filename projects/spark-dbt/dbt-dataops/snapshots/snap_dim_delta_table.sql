{% snapshot snap_dim_delta_table %}

{{
    config(
        target_schema='dbt_dataops_dwh',
        unique_key='table_fqn',
        strategy='check',
        check_cols=['__scd2_hash'],
        file_format='delta',
        location_root='none',
        partition_by=['event_year_date']
    )
}}

    SELECT
    -- Business key
        table_fqn,
        database_name,
        table_name,

        -- SCD1 columns
        table_id,
        location,
        format,
        partition_columns,

        -- SCD2 columns
        clustering_columns,
        table_properties,
        min_reader_version,
        min_writer_version,

        -- Hash columns
        __scd2_hash,
        __scd1_hash,
        __merge_effective_date,

        -- Partition and audit columns
        current_timestamp() AS dbt_loaded_at,
        date_format(current_timestamp(), 'yyyyMMdd') AS event_year_date

    FROM {{ ref('stg_delta_table_snapshots') }}

{% endsnapshot %}
