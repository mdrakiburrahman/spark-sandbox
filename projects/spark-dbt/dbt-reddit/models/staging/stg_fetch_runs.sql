with source as (

    select * from {{ source('reddit_raw', 'fetch_runs') }}

)

select
    run_id        as run_natural_id,
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
from source
where run_id is not null
