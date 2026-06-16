with source as (

    select * from {{ source('reddit_raw', 'comments') }}

)

select
    id            as comment_natural_id,
    post_id       as post_natural_id,
    author_id     as author_natural_id,
    parent_id,
    body,
    score,
    depth,
    coalesce(is_submitter, false) as is_submitter,
    coalesce(stickied, false)     as stickied,
    created_utc   as commented_at,
    edited_utc    as edited_at,
    fetch_run_id  as run_natural_id,
    fetched_at,
    substr(parent_id, 1, 3) = 't3_' as is_reply_to_post,
    substr(parent_id, 1, 3) = 't1_' as is_reply_to_comment
from source
where id is not null
