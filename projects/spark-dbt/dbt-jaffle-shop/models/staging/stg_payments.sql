with source as (
    
    select * from {{ ref('raw_payments') }}

),

renamed as (

    select
        id as payment_id,
        order_id,
        payment_method,

        -- `amount` is currently stored in cents, so we convert it to dollars
        amount / 100 as amount

    from source

),

-- Deduplicate on natural key
deduped as (
    select
        *,
        row_number() over (partition by payment_id order by payment_id) as _row_num
    from renamed
)

select
    payment_id,
    order_id,
    payment_method,
    amount
from deduped
where _row_num = 1
