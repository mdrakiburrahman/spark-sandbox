WITH source AS (
    SELECT * FROM {{ source('dataops_inventory', 'dbt_node_executions') }}
),

deduped AS (
    SELECT
        *,
        row_number() OVER (
            PARTITION BY invocation_id, unique_id
            ORDER BY generated_at DESC, execute_completed_at DESC
        ) AS _row_num
    FROM source
),

cleaned AS (
    SELECT
        -- Grain keys
        invocation_id,
        unique_id,

        -- Invocation context
        project,
        command,
        dbt_version,
        thread_id,
        generated_at,

        -- Node identity / metadata
        resource_type,
        package_name,
        name AS node_name,
        alias,
        database AS database_name,
        schema_name,
        relation_name,
        original_file_path,
        materialized,

        -- Derived node layer: folder for models, resource_type otherwise
        CASE
            WHEN resource_type = 'model' AND original_file_path LIKE 'models/%/%'
                THEN split(original_file_path, '/')[1]
            ELSE resource_type
        END AS node_layer,

        -- Test metadata (extracted from JSON)
        get_json_object(test_metadata_json, '$.name') AS test_type,
        coalesce(
            get_json_object(test_metadata_json, '$.kwargs.column_name'),
            get_json_object(test_metadata_json, '$.kwargs.key_column')
        ) AS tested_column,
        get_json_object(adapter_response_json, '$._message') AS adapter_message,

        -- Status + boolean flags
        status,
        CASE WHEN status = 'success' THEN TRUE ELSE FALSE END AS is_success,
        CASE WHEN status = 'error' THEN TRUE ELSE FALSE END AS is_error,
        CASE WHEN status = 'skipped' THEN TRUE ELSE FALSE END AS is_skipped,
        CASE WHEN status = 'pass' THEN TRUE ELSE FALSE END AS is_pass,
        CASE WHEN status = 'fail' THEN TRUE ELSE FALSE END AS is_fail,
        CASE WHEN status = 'warn' THEN TRUE ELSE FALSE END AS is_warn,
        CASE WHEN status IN ('error', 'fail') THEN TRUE ELSE FALSE END AS has_failure,
        CASE WHEN resource_type = 'test' THEN TRUE ELSE FALSE END AS is_test,

        -- Timing measures
        execution_time,
        compile_time,
        execute_time,
        compile_started_at,
        compile_completed_at,
        execute_started_at,
        execute_completed_at,

        -- Adapter-reported measures (often NULL on the fabricspark adapter)
        rows_affected,
        failures,

        -- DAG edges
        depends_on_nodes,

        -- Date + partition keys
        date_format(coalesce(execute_completed_at, generated_at), 'yyyyMMdd') AS run_date_key,
        event_year_month
    FROM deduped
    WHERE _row_num = 1
)

SELECT * FROM cleaned
