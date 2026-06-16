-- GRAIN: one row per (post, fetch_run) — periodic snapshot.
-- Today the source carries a single fetch_run, so this materializes as one row
-- per post; subsequent re-fetches append snapshots without violating the grain.

with posts as (

    select * from {{ ref('stg_posts') }}

)

select
    {{ dbt_utils.generate_surrogate_key(['p.post_natural_id', 'p.run_natural_id']) }} as fct_post_key,
    coalesce(dp.post_key, '-1')         as post_key,
    coalesce(da.author_key, '-1')       as author_key,
    coalesce(ds.subreddit_key, '-1')    as subreddit_key,
    coalesce(dpf.post_flair_key, '-1')  as post_flair_key,
    coalesce(dd_posted.date_key, '-1')  as posted_date_key,
    coalesce(dd_fetched.date_key, '-1') as fetched_date_key,
    coalesce(dfr.fetch_run_key, '-1')   as fetch_run_key,
    p.post_natural_id,
    p.score,
    p.upvote_ratio,
    p.num_comments,
    cast(1 as int)                      as post_count
from posts p
left join {{ ref('dim_post') }}       dp         on dp.post_natural_id = p.post_natural_id
left join {{ ref('dim_author') }}     da         on da.author_natural_id = p.author_natural_id
left join {{ ref('dim_subreddit') }}  ds         on ds.subreddit_natural_id = p.subreddit_natural_id
left join {{ ref('dim_post_flair') }} dpf        on dpf.flair_text = p.flair_text
left join {{ ref('dim_date') }}       dd_posted  on dd_posted.date_key = date_format(p.posted_at, 'yyyyMMdd')
left join {{ ref('dim_date') }}       dd_fetched on dd_fetched.date_key = date_format(p.fetched_at, 'yyyyMMdd')
left join {{ ref('dim_fetch_run') }}  dfr        on dfr.run_natural_id = p.run_natural_id
