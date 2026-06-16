WITH source AS (

    SELECT * FROM {{ source('reddit_raw', 'subreddits') }}

)

SELECT
    id AS subreddit_natural_id,
    display_name,
    subscribers,
    created_utc,
    fetched_at,
    fetch_run_id AS run_natural_id
FROM source
WHERE id IS NOT NULL
