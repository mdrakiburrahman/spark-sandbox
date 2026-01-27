with source as (

    {#-
    Selecting from the seed database where raw data is loaded
    #}
    select * from {{ source('jaffle_shop_seed', 'raw_orders') }}

),

renamed as (

    select
        id as order_id,
        user_id as customer_id,
        order_date,
        status

    from source

)

select * from renamed
