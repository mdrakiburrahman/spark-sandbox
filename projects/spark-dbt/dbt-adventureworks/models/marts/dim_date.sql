WITH stg_date AS (
    SELECT * FROM {{ ref('date') }}
)

SELECT
    {{ dbt_utils.generate_surrogate_key(['stg_date.date_day']) }} AS date_key,
    *
FROM stg_date
