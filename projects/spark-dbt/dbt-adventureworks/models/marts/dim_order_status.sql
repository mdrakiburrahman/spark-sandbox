WITH stg_order_status AS (
    SELECT DISTINCT status AS order_status
    FROM
        {{ ref('salesorderheader') }}
)

SELECT
    {{ dbt_utils.generate_surrogate_key(['stg_order_status.order_status']) }} AS order_status_key,
    order_status,
    CASE
        WHEN order_status = 1 THEN 'in_process'
        WHEN order_status = 2 THEN 'approved'
        WHEN order_status = 3 THEN 'backordered'
        WHEN order_status = 4 THEN 'rejected'
        WHEN order_status = 5 THEN 'shipped'
        WHEN order_status = 6 THEN 'cancelled'
        ELSE 'no_status'
    END AS order_status_name
FROM stg_order_status
