WITH source AS (

    SELECT * FROM {{ ref('raw_payments') }}

),

renamed AS (

    SELECT
        id AS payment_id,
        order_id,
        payment_method,

        -- `amount` is currently stored in cents, so we convert it to dollars
        amount / 100 AS amount

    FROM source

),

-- Deduplicate on natural key
deduped AS (
    SELECT
        *,
        row_number() OVER (PARTITION BY payment_id ORDER BY payment_id) AS _row_num
    FROM renamed
)

SELECT
    payment_id,
    order_id,
    payment_method,
    amount
FROM deduped
WHERE _row_num = 1
