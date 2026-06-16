WITH flairs AS (

    SELECT DISTINCT
        flair_text,
        flair_category
    FROM {{ ref('stg_posts') }}

)

SELECT
    {{ dbt_utils.generate_surrogate_key(['flair_text']) }} AS post_flair_key,
    flair_text,
    flair_category
FROM flairs

UNION ALL

SELECT
    '-1' AS post_flair_key,
    'Unknown' AS flair_text,
    cast(NULL AS string) AS flair_category
