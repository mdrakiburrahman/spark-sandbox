WITH stg_salesorderheader AS (
    SELECT
        salesorderid,
        customerid,
        creditcardid,
        shiptoaddressid,
        status AS order_status,
        cast(orderdate AS date) AS orderdate
    FROM {{ ref('salesorderheader') }}
),

stg_salesorderdetail AS (
    SELECT
        salesorderid,
        salesorderdetailid,
        productid,
        orderqty,
        unitprice,
        unitprice * orderqty AS revenue
    FROM {{ ref('salesorderdetail') }}
)

SELECT
    {{ dbt_utils.generate_surrogate_key(['stg_salesorderdetail.salesorderid', 'salesorderdetailid']) }} AS sales_key,
    {{ dbt_utils.generate_surrogate_key(['productid']) }} AS product_key,
    {{ dbt_utils.generate_surrogate_key(['customerid']) }} AS customer_key,
    CASE
        WHEN creditcardid IS NOT NULL
            THEN {{ dbt_utils.generate_surrogate_key(['creditcardid']) }}
        ELSE NULL
    END AS creditcard_key,
    {{ dbt_utils.generate_surrogate_key(['shiptoaddressid']) }} AS ship_address_key,
    {{ dbt_utils.generate_surrogate_key(['order_status']) }} AS order_status_key,
    {{ dbt_utils.generate_surrogate_key(['orderdate']) }} AS order_date_key,
    stg_salesorderdetail.salesorderid,
    stg_salesorderdetail.salesorderdetailid,
    stg_salesorderdetail.unitprice,
    stg_salesorderdetail.orderqty,
    stg_salesorderdetail.revenue
FROM stg_salesorderdetail
INNER JOIN stg_salesorderheader ON stg_salesorderdetail.salesorderid = stg_salesorderheader.salesorderid
WHERE EXISTS (
    SELECT 1 FROM {{ ref('dim_address') }} da
    WHERE da.address_key = {{ dbt_utils.generate_surrogate_key(['stg_salesorderheader.shiptoaddressid']) }}
)
