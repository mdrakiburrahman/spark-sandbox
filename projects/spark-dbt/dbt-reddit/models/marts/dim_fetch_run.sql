with stg as (

    select * from {{ ref('stg_fetch_runs') }}

)

select
    {{ dbt_utils.generate_surrogate_key(['run_natural_id']) }} as fetch_run_key,
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
from stg

union all

select
    '-1'                     as fetch_run_key,
    cast(-1 as bigint)       as run_natural_id,
    'Unknown'                as subreddit,
    'Unknown'                as listing_type,
    cast(null as string)     as time_window,
    cast(null as int)        as limit_requested,
    cast(null as boolean)    as skip_comments,
    cast(null as timestamp)  as started_at,
    cast(null as timestamp)  as finished_at,
    cast(null as int)        as posts_ingested,
    cast(null as int)        as comments_ingested,
    cast(null as bigint)     as more_calls,
    cast(null as int)        as subreddits_seen,
    cast(null as int)        as authors_seen
