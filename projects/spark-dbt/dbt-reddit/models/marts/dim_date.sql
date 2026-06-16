WITH date_spine AS (

    SELECT
        explode(
            sequence(
                cast('2024-01-01' AS date),
                cast('2027-12-31' AS date),
                INTERVAL 1 DAY
            )
        ) AS calendar_date

),

calendar AS (

    SELECT
        date_format(calendar_date, 'yyyyMMdd') AS date_key,
        calendar_date AS date,
        dayofmonth(calendar_date) AS day,
        dayofweek(calendar_date) AS day_of_week,
        date_format(calendar_date, 'EEEE') AS day_of_week_name,
        dayofmonth(calendar_date) AS day_of_month,
        dayofyear(calendar_date) AS day_of_year,
        weekofyear(calendar_date) AS week_of_year,
        weekofyear(calendar_date) AS iso_week_of_year,
        month(calendar_date) AS month,
        date_format(calendar_date, 'MMMM') AS month_name,
        quarter(calendar_date) AS quarter,
        concat('Q', quarter(calendar_date)) AS quarter_name,
        year(calendar_date) AS year,
        trunc(calendar_date, 'MM') AS first_day_of_month,
        last_day(calendar_date) AS last_day_of_month,
        trunc(calendar_date, 'YEAR') AS first_day_of_year,
        make_date(year(calendar_date), 12, 31) AS last_day_of_year,
        CASE WHEN dayofweek(calendar_date) IN (1, 7) THEN TRUE ELSE FALSE END AS is_weekend
    FROM date_spine

),

unknown_member AS (

    SELECT
        '-1' AS date_key,
        cast(NULL AS date) AS date,
        cast(NULL AS int) AS day,
        cast(NULL AS int) AS day_of_week,
        cast(NULL AS string) AS day_of_week_name,
        cast(NULL AS int) AS day_of_month,
        cast(NULL AS int) AS day_of_year,
        cast(NULL AS int) AS week_of_year,
        cast(NULL AS int) AS iso_week_of_year,
        cast(NULL AS int) AS month,
        cast(NULL AS string) AS month_name,
        cast(NULL AS int) AS quarter,
        cast(NULL AS string) AS quarter_name,
        cast(NULL AS int) AS year,
        cast(NULL AS date) AS first_day_of_month,
        cast(NULL AS date) AS last_day_of_month,
        cast(NULL AS date) AS first_day_of_year,
        cast(NULL AS date) AS last_day_of_year,
        cast(NULL AS boolean) AS is_weekend

)

SELECT * FROM calendar
UNION ALL
SELECT * FROM unknown_member
