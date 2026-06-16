WITH stg_address AS (
    SELECT *
    FROM {{ ref('address') }}
),

stg_stateprovince AS (
    SELECT *
    FROM {{ ref('stateprovince') }}
),

stg_countryregion AS (
    SELECT *
    FROM {{ ref('countryregion') }}
)

SELECT
    {{ dbt_utils.generate_surrogate_key(['stg_address.addressid']) }} AS address_key,
    stg_address.addressid,
    stg_address.city AS city_name,
    stg_stateprovince.name AS state_name,
    stg_countryregion.name AS country_name
FROM stg_address
LEFT JOIN stg_stateprovince ON stg_address.stateprovinceid = stg_stateprovince.stateprovinceid
LEFT JOIN stg_countryregion ON stg_stateprovince.countryregioncode = stg_countryregion.countryregioncode
