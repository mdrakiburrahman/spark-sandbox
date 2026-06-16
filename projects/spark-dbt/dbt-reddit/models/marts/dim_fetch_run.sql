WITH stg AS (

    SELECT * FROM {{ ref('stg_fetch_runs') }}

)

SELECT
    {{ dbt_utils.generate_surrogate_key(['run_natural_id']) }} AS fetch_run_key,
    run_natural_id,
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
FROM stg

UNION ALL

SELECT
    '-1' AS fetch_run_key,
    cast(-1 AS bigint) AS run_natural_id,
    'Unknown' AS subreddit,
    'Unknown' AS listing_type,
    cast(NULL AS string) AS time_window,
    cast(NULL AS int) AS limit_requested,
    cast(NULL AS boolean) AS skip_comments,
    cast(NULL AS timestamp) AS started_at,
    cast(NULL AS timestamp) AS finished_at,
    cast(NULL AS int) AS posts_ingested,
    cast(NULL AS int) AS comments_ingested,
    cast(NULL AS bigint) AS more_calls,
    cast(NULL AS int) AS subreddits_seen,
    cast(NULL AS int) AS authors_seen
