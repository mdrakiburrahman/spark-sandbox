{{
    config(
        materialized='table',
        file_format='delta',
        location_root='none'
    )
}}

WITH date_spine AS (
    SELECT
        explode(
            sequence(
                cast('2024-01-01' AS date),
                cast('2027-12-31' AS date),
                INTERVAL 1 DAY
            )
        ) AS full_date
)

SELECT
    date_format(full_date, 'yyyyMMdd') AS date_key,
    full_date,
    year(full_date) AS year,
    quarter(full_date) AS quarter,
    month(full_date) AS month,
    date_format(full_date, 'MMMM') AS month_name,
    day(full_date) AS day_of_month,
    dayofweek(full_date) AS day_of_week,
    date_format(full_date, 'EEEE') AS day_name,
    weekofyear(full_date) AS week_of_year,
    coalesce(dayofweek(full_date) IN (1, 7), FALSE) AS is_weekend
FROM date_spine
