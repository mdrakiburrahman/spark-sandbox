{{
    config(
        materialized='table',
        file_format='delta',
        location_root='none'
    )
}}

with date_spine as (
    select
        explode(
            sequence(
                cast('2024-01-01' as date),
                cast('2027-12-31' as date),
                interval 1 day
            )
        ) as full_date
)

select
    date_format(full_date, 'yyyyMMdd') as date_key,
    full_date,
    year(full_date) as year,
    quarter(full_date) as quarter,
    month(full_date) as month,
    date_format(full_date, 'MMMM') as month_name,
    day(full_date) as day_of_month,
    dayofweek(full_date) as day_of_week,
    date_format(full_date, 'EEEE') as day_name,
    weekofyear(full_date) as week_of_year,
    case when dayofweek(full_date) in (1, 7) then true else false end as is_weekend
from date_spine
