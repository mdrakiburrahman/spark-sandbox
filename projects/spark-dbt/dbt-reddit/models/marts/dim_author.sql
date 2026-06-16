WITH stg_authors AS (

    SELECT * FROM {{ ref('stg_authors') }}

),

deduped AS (

    SELECT
        *,
        row_number() OVER (
            PARTITION BY author_natural_id
            ORDER BY fetched_at DESC NULLS LAST, run_natural_id DESC NULLS LAST
        ) AS _row_num
    FROM stg_authors

),

employees AS (

    SELECT * FROM {{ ref('stg_microsoft_employees') }}

)

SELECT
    {{ dbt_utils.generate_surrogate_key(['a.author_natural_id']) }} AS author_key,
    a.author_natural_id,
    a.author_name,
    a.is_deleted,
    e.username_lc IS NOT NULL AS is_microsoft_employee,
    e.msft_username,
    e.msft_job_title,
    e.msft_department,
    coalesce(lower(e.msft_job_title) LIKE '%product manager%', FALSE) AS is_product_manager,
    a.fetched_at
FROM deduped a
LEFT JOIN employees e ON lower(a.author_name) = e.username_lc
WHERE a._row_num = 1

UNION ALL

SELECT
    '-1' AS author_key,
    'UNKNOWN' AS author_natural_id,
    'Unknown' AS author_name,
    cast(TRUE AS boolean) AS is_deleted,
    cast(FALSE AS boolean) AS is_microsoft_employee,
    cast(NULL AS string) AS msft_username,
    cast(NULL AS string) AS msft_job_title,
    cast(NULL AS string) AS msft_department,
    cast(FALSE AS boolean) AS is_product_manager,
    cast(NULL AS timestamp) AS fetched_at
