WITH source AS (

    SELECT * FROM {{ ref('raw_customers') }}

),

renamed AS (

    SELECT
        id AS customer_id,
        first_name,
        last_name

    FROM source

),

-- Deduplicate on natural key
deduped AS (
    SELECT
        *,
        row_number() OVER (PARTITION BY customer_id ORDER BY customer_id) AS _row_num
    FROM renamed
)

SELECT
    customer_id,
    first_name,
    last_name
FROM deduped
WHERE _row_num = 1
