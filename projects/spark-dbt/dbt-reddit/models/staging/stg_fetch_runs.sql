WITH source AS (

    SELECT * FROM {{ source('reddit_raw', 'fetch_runs') }}

)

SELECT
    run_id AS run_natural_id,
    subreddit,
    listing_type,
    time_window,
    limit_requested,
    skip_comments,
    started_at,
    finished_at,
    posts_ingested,
    comments_ingested,
    more_calls,
    subreddits_seen,
    authors_seen
FROM source
WHERE run_id IS NOT NULL
