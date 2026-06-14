WITH f_sales AS (
    SELECT * FROM {{ ref('fct_sales') }}
),

d_customer AS (
    SELECT * FROM {{ ref('dim_customer') }}
),

d_credit_card AS (
    SELECT * FROM {{ ref('dim_credit_card') }}
),

d_address AS (
    SELECT * FROM {{ ref('dim_address') }}
),

d_order_status AS (
    SELECT * FROM {{ ref('dim_order_status') }}
),

d_product AS (
    SELECT * FROM {{ ref('dim_product') }}
),

d_date AS (
    SELECT * FROM {{ ref('dim_date') }}
)

SELECT
    {{ dbt_utils.star(from=ref('fct_sales'), relation_alias='f_sales', except=[
        "product_key", "customer_key", "creditcard_key", "ship_address_key", "order_status_key", "order_date_key"
    ]) }},
    {{ dbt_utils.star(from=ref('dim_product'), relation_alias='d_product', except=["product_key"]) }},
    {{ dbt_utils.star(from=ref('dim_customer'), relation_alias='d_customer', except=["customer_key"]) }},
    {{ dbt_utils.star(from=ref('dim_credit_card'), relation_alias='d_credit_card', except=["creditcard_key"]) }},
    {{ dbt_utils.star(from=ref('dim_address'), relation_alias='d_address', except=["address_key"]) }},
    {{ dbt_utils.star(from=ref('dim_order_status'), relation_alias='d_order_status', except=["order_status_key"]) }},
    {{ dbt_utils.star(from=ref('dim_date'), relation_alias='d_date', except=["date_key"]) }}
FROM f_sales
LEFT JOIN d_product ON f_sales.product_key = d_product.product_key
LEFT JOIN d_customer ON f_sales.customer_key = d_customer.customer_key
LEFT JOIN d_credit_card ON f_sales.creditcard_key = d_credit_card.creditcard_key
LEFT JOIN d_address ON f_sales.ship_address_key = d_address.address_key
LEFT JOIN d_order_status ON f_sales.order_status_key = d_order_status.order_status_key
LEFT JOIN d_date ON f_sales.order_date_key = d_date.date_key
