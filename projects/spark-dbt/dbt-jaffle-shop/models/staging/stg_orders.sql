WITH source AS (

    SELECT * FROM {{ ref('raw_orders') }}

),

renamed AS (

    SELECT
        id AS order_id,
        user_id AS customer_id,
        order_date,
        status

    FROM source

),

-- Deduplicate on natural key
deduped AS (
    SELECT
        *,
        row_number() OVER (PARTITION BY order_id ORDER BY order_id) AS _row_num
    FROM renamed
)

SELECT
    order_id,
    customer_id,
    order_date,
    status
FROM deduped
WHERE _row_num = 1
