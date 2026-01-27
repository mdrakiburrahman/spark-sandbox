with source as (

    {#-
    Selecting from the seed database where raw data is loaded
    #}
    select * from {{ source('jaffle_shop_seed', 'raw_customers') }}

),

renamed as (

    select
        id as customer_id,
        first_name,
        last_name

    from source

)

select * from renamed
