{{
    config(
        materialized='table',
        file_format='delta',
        location_root='none'
    )
}}

WITH operations AS (
    SELECT
        operation,
        operation_category,
        cast(is_data_changing AS boolean) AS is_data_changing,
        cast(is_row_producing AS boolean) AS is_row_producing,
        description
    FROM (
        VALUES
        ('WRITE', 'data_changing', TRUE, TRUE, 'Inserts or overwrites data in a table'),
        ('MERGE', 'data_changing', TRUE, TRUE, 'Upserts data using merge conditions'),
        ('UPDATE', 'data_changing', TRUE, FALSE, 'Updates existing rows in place'),
        ('DELETE', 'data_changing', TRUE, FALSE, 'Deletes rows from a table'),
        ('STREAMING UPDATE', 'data_changing', TRUE, TRUE, 'Streaming micro-batch write operation'),
        ('INSERT', 'data_changing', TRUE, TRUE, 'Inserts new rows into a table'),
        ('CREATE TABLE AS SELECT', 'ddl', TRUE, TRUE, 'Creates a new table from a query result'),
        ('REPLACE TABLE AS SELECT', 'ddl', TRUE, TRUE, 'Replaces table contents from a query result'),
        ('CREATE OR REPLACE TABLE AS SELECT', 'ddl', TRUE, TRUE, 'Creates or replaces table from a query result'),
        ('CREATE OR REPLACE TABLE', 'ddl', TRUE, FALSE, 'Creates or replaces a table definition'),
        ('OPTIMIZE', 'maintenance', FALSE, FALSE, 'Compacts small files into larger files'),
        ('VACUUM', 'maintenance', FALSE, FALSE, 'Removes old files no longer referenced'),
        ('RESTORE', 'maintenance', FALSE, FALSE, 'Restores table to a previous version'),
        ('SET TBLPROPERTIES', 'maintenance', FALSE, FALSE, 'Modifies table properties'),
        ('CONVERT', 'ddl', TRUE, FALSE, 'Converts Parquet table to Delta format')
    )
)

SELECT
    sha2(operation, 256) AS operation_type_key,
    operation,
    operation_category,
    is_data_changing,
    is_row_producing,
    description
FROM operations
