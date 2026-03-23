{{
    config(
        materialized='table',
        file_format='delta',
        location_root='none'
    )
}}

with operations as (
    select
        operation,
        operation_category,
        cast(is_data_changing as boolean) as is_data_changing,
        cast(is_row_producing as boolean) as is_row_producing,
        description
    from (
        values
            ('WRITE', 'data_changing', true, true, 'Inserts or overwrites data in a table'),
            ('MERGE', 'data_changing', true, true, 'Upserts data using merge conditions'),
            ('UPDATE', 'data_changing', true, false, 'Updates existing rows in place'),
            ('DELETE', 'data_changing', true, false, 'Deletes rows from a table'),
            ('STREAMING UPDATE', 'data_changing', true, true, 'Streaming micro-batch write operation'),
            ('INSERT', 'data_changing', true, true, 'Inserts new rows into a table'),
            ('CREATE TABLE AS SELECT', 'ddl', true, true, 'Creates a new table from a query result'),
            ('REPLACE TABLE AS SELECT', 'ddl', true, true, 'Replaces table contents from a query result'),
            ('CREATE OR REPLACE TABLE AS SELECT', 'ddl', true, true, 'Creates or replaces table from a query result'),
            ('CREATE OR REPLACE TABLE', 'ddl', true, false, 'Creates or replaces a table definition'),
            ('OPTIMIZE', 'maintenance', false, false, 'Compacts small files into larger files'),
            ('VACUUM', 'maintenance', false, false, 'Removes old files no longer referenced'),
            ('RESTORE', 'maintenance', false, false, 'Restores table to a previous version'),
            ('SET TBLPROPERTIES', 'maintenance', false, false, 'Modifies table properties'),
            ('CONVERT', 'ddl', true, false, 'Converts Parquet table to Delta format')
    ) as t(operation, operation_category, is_data_changing, is_row_producing, description)
)

select
    sha2(operation, 256) as operation_type_key,
    operation,
    operation_category,
    is_data_changing,
    is_row_producing,
    description
from operations
