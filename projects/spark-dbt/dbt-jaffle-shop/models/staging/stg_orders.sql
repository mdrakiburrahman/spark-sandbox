with source as (

    select * from {{ ref('raw_orders') }}

),

renamed as (

    select
        id as order_id,
        user_id as customer_id,
        order_date,
        status

    from source

),

-- Deduplicate on natural key
deduped as (
    select
        *,
        row_number() over (partition by order_id order by order_id) as _row_num
    from renamed
)

select
    order_id,
    customer_id,
    order_date,
    status
from deduped
where _row_num = 1
