with source as (

    select * from {{ source('reddit_raw', 'subreddits') }}

)

select
    id            as subreddit_natural_id,
    display_name,
    subscribers,
    created_utc,
    fetched_at,
    fetch_run_id  as run_natural_id
from source
where id is not null
