{% set payment_methods = ['credit_card', 'coupon', 'bank_transfer', 'gift_card'] %}

WITH orders AS (

    SELECT * FROM {{ ref('stg_orders') }}

),

payments AS (

    SELECT * FROM {{ ref('stg_payments') }}

),

customers AS (

    SELECT * FROM {{ ref('stg_customers') }}

),

order_payments AS (

    SELECT
        order_id,

        {% for payment_method in payment_methods -%}
            sum(CASE WHEN payment_method = '{{ payment_method }}' THEN amount ELSE 0 END) AS {{ payment_method }}_amount,
        {% endfor -%}

        sum(amount) AS total_amount

    FROM payments

    GROUP BY order_id

),

final AS (

    SELECT
        orders.order_id,
        orders.customer_id,
        orders.order_date,
        orders.status,

        {% for payment_method in payment_methods -%}

            order_payments.{{ payment_method }}_amount,

        {% endfor -%}

        order_payments.total_amount AS amount

    FROM orders

    -- FK integrity: only include orders whose customer exists
    INNER JOIN customers
        ON orders.customer_id = customers.customer_id

    LEFT JOIN order_payments
        ON orders.order_id = order_payments.order_id

)

SELECT * FROM final
