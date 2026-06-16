WITH source AS (

    SELECT * FROM {{ source('reddit_raw', 'authors') }}

)

SELECT
    id AS author_natural_id,
    name AS author_name,
    coalesce(is_deleted, FALSE) AS is_deleted,
    fetched_at,
    fetch_run_id AS run_natural_id
FROM source
WHERE id IS NOT NULL
