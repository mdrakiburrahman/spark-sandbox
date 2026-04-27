with source as (

    select * from {{ ref('raw_customers') }}

),

renamed as (

    select
        id as customer_id,
        first_name,
        last_name

    from source

),

-- Deduplicate on natural key
deduped as (
    select
        *,
        row_number() over (partition by customer_id order by customer_id) as _row_num
    from renamed
)

select
    customer_id,
    first_name,
    last_name
from deduped
where _row_num = 1
