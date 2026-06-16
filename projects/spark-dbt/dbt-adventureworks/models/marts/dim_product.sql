WITH stg_product AS (
    SELECT *
    FROM {{ ref('product') }}
),

stg_product_subcategory AS (
    SELECT *
    FROM {{ ref('productsubcategory') }}
),

stg_product_category AS (
    SELECT *
    FROM {{ ref('productcategory') }}
)

SELECT
    {{ dbt_utils.generate_surrogate_key(['stg_product.productid']) }} AS product_key,
    stg_product.productid,
    stg_product.name AS product_name,
    stg_product.productnumber,
    stg_product.color,
    stg_product.class,
    stg_product_subcategory.name AS product_subcategory_name,
    stg_product_category.name AS product_category_name
FROM stg_product
LEFT JOIN stg_product_subcategory ON stg_product.productsubcategoryid = stg_product_subcategory.productsubcategoryid
LEFT JOIN stg_product_category ON stg_product_subcategory.productcategoryid = stg_product_category.productcategoryid
