WITH source AS (
    SELECT * FROM {{ source('dataops_inventory', 'commit_history') }}
),

cleaned AS (
    SELECT
        table_fqn,
        database_name,
        table_name,
        table_id,
        version,
        commit_timestamp,
        operation,
        operation_parameters,
        operation_metrics,
        read_version,
        isolation_level,
        is_blind_append,
        user_id,
        user_name,
        user_metadata,
        num_output_rows,
        num_added_files,
        num_removed_files,
        num_output_bytes,
        execution_time_ms,
        ingested_at,
        snapshot_date,
        snapshot_date AS date_key
    FROM source
)

SELECT * FROM cleaned
