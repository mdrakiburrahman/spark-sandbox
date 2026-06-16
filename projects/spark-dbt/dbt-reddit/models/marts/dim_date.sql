with date_spine as (

    select
        explode(
            sequence(
                cast('2024-01-01' as date),
                cast('2027-12-31' as date),
                interval 1 day
            )
        ) as calendar_date

),

calendar as (

    select
        date_format(calendar_date, 'yyyyMMdd')   as date_key,
        calendar_date                            as date,
        dayofmonth(calendar_date)                as day,
        dayofweek(calendar_date)                 as day_of_week,
        date_format(calendar_date, 'EEEE')       as day_of_week_name,
        dayofmonth(calendar_date)                as day_of_month,
        dayofyear(calendar_date)                 as day_of_year,
        weekofyear(calendar_date)                as week_of_year,
        weekofyear(calendar_date)                as iso_week_of_year,
        month(calendar_date)                     as month,
        date_format(calendar_date, 'MMMM')       as month_name,
        quarter(calendar_date)                   as quarter,
        concat('Q', quarter(calendar_date))      as quarter_name,
        year(calendar_date)                      as year,
        trunc(calendar_date, 'MM')               as first_day_of_month,
        last_day(calendar_date)                  as last_day_of_month,
        trunc(calendar_date, 'YEAR')             as first_day_of_year,
        make_date(year(calendar_date), 12, 31)   as last_day_of_year,
        case when dayofweek(calendar_date) in (1, 7) then true else false end as is_weekend
    from date_spine

),

unknown_member as (

    select
        '-1'                       as date_key,
        cast(null as date)         as date,
        cast(null as int)          as day,
        cast(null as int)          as day_of_week,
        cast(null as string)       as day_of_week_name,
        cast(null as int)          as day_of_month,
        cast(null as int)          as day_of_year,
        cast(null as int)          as week_of_year,
        cast(null as int)          as iso_week_of_year,
        cast(null as int)          as month,
        cast(null as string)       as month_name,
        cast(null as int)          as quarter,
        cast(null as string)       as quarter_name,
        cast(null as int)          as year,
        cast(null as date)         as first_day_of_month,
        cast(null as date)         as last_day_of_month,
        cast(null as date)         as first_day_of_year,
        cast(null as date)         as last_day_of_year,
        cast(null as boolean)      as is_weekend

)

select * from calendar
union all
select * from unknown_member
