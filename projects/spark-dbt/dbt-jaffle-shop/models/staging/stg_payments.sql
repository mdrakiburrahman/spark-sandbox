with source as (
    
    {#-
    Selecting from the seed database where raw data is loaded
    #}
    select * from {{ source('jaffle_shop_seed', 'raw_payments') }}

),

renamed as (

    select
        id as payment_id,
        order_id,
        payment_method,

        -- `amount` is currently stored in cents, so we convert it to dollars
        amount / 100 as amount

    from source

)

select * from renamed
