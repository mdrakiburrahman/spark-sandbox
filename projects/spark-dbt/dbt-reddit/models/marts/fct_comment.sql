-- GRAIN: one row per Reddit comment — transaction fact.
-- subreddit_key and post_flair_key are denormalized from dim_post so every
-- comment can be sliced by feature area without re-joining the post.

WITH comments AS (

    SELECT * FROM {{ ref('stg_comments') }}

)

SELECT
    {{ dbt_utils.generate_surrogate_key(['c.comment_natural_id']) }} AS fct_comment_key,
    coalesce(dp.post_key, '-1') AS post_key,
    coalesce(da.author_key, '-1') AS author_key,
    coalesce(dp.subreddit_key, '-1') AS subreddit_key,
    coalesce(dp.post_flair_key, '-1') AS post_flair_key,
    coalesce(dd_c.date_key, '-1') AS commented_date_key,
    coalesce(dd_e.date_key, '-1') AS edited_date_key,
    coalesce(dd_f.date_key, '-1') AS fetched_date_key,
    coalesce(dfr.fetch_run_key, '-1') AS fetch_run_key,
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
    cast(1 AS int) AS comment_count
FROM comments c
LEFT JOIN {{ ref('dim_post') }} dp ON dp.post_natural_id = c.post_natural_id
LEFT JOIN {{ ref('dim_author') }} da ON da.author_natural_id = c.author_natural_id
LEFT JOIN {{ ref('dim_date') }} dd_c ON dd_c.date_key = date_format(c.commented_at, 'yyyyMMdd')
LEFT JOIN {{ ref('dim_date') }} dd_e ON dd_e.date_key = date_format(c.edited_at, 'yyyyMMdd')
LEFT JOIN {{ ref('dim_date') }} dd_f ON dd_f.date_key = date_format(c.fetched_at, 'yyyyMMdd')
LEFT JOIN {{ ref('dim_fetch_run') }} dfr ON dfr.run_natural_id = c.run_natural_id
