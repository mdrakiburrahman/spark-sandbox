-- GRAIN: one row per Reddit comment — transaction fact.
-- subreddit_key and post_flair_key are denormalized from dim_post so every
-- comment can be sliced by feature area without re-joining the post.

with comments as (

    select * from {{ ref('stg_comments') }}

)

select
    {{ dbt_utils.generate_surrogate_key(['c.comment_natural_id']) }} as fct_comment_key,
    coalesce(dp.post_key, '-1')       as post_key,
    coalesce(da.author_key, '-1')     as author_key,
    coalesce(dp.subreddit_key, '-1')  as subreddit_key,
    coalesce(dp.post_flair_key, '-1') as post_flair_key,
    coalesce(dd_c.date_key, '-1')     as commented_date_key,
    coalesce(dd_e.date_key, '-1')     as edited_date_key,
    coalesce(dd_f.date_key, '-1')     as fetched_date_key,
    coalesce(dfr.fetch_run_key, '-1') as fetch_run_key,
    c.comment_natural_id,
    c.parent_id,
    c.is_reply_to_post,
    c.is_reply_to_comment,
    c.depth,
    c.is_submitter,
    c.stickied,
    c.commented_at,
    c.edited_at,
    c.score,
    cast(1 as int)                    as comment_count
from comments c
left join {{ ref('dim_post') }}      dp   on dp.post_natural_id = c.post_natural_id
left join {{ ref('dim_author') }}    da   on da.author_natural_id = c.author_natural_id
left join {{ ref('dim_date') }}      dd_c on dd_c.date_key = date_format(c.commented_at, 'yyyyMMdd')
left join {{ ref('dim_date') }}      dd_e on dd_e.date_key = date_format(c.edited_at, 'yyyyMMdd')
left join {{ ref('dim_date') }}      dd_f on dd_f.date_key = date_format(c.fetched_at, 'yyyyMMdd')
left join {{ ref('dim_fetch_run') }} dfr  on dfr.run_natural_id = c.run_natural_id
