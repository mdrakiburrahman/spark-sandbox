with stg_date as (
    select * from {{ source('adventureworks_seed', 'date') }}
)

select
    {{ dbt_utils.generate_surrogate_key(['stg_date.date_day']) }} as date_key,
    *
from stg_date
