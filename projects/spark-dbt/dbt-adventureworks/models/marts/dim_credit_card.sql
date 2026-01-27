with stg_salesorderheader as (
    select distinct creditcardid
    from {{ source('adventureworks_seed', 'salesorderheader') }}
    where creditcardid is not null
),

stg_creditcard as (
    select *
    from {{ source('adventureworks_seed', 'creditcard') }}
)

select
    {{ dbt_utils.generate_surrogate_key(['stg_salesorderheader.creditcardid']) }} as creditcard_key,
    stg_salesorderheader.creditcardid,
    stg_creditcard.cardtype
from stg_salesorderheader
left join stg_creditcard on stg_salesorderheader.creditcardid = stg_creditcard.creditcardid
