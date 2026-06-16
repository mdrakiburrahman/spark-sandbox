-- GRAIN: one row per (post, fetch_run) — periodic snapshot.
-- Today the source carries a single fetch_run, so this materializes as one row
-- per post; subsequent re-fetches append snapshots without violating the grain.

WITH posts AS (

    SELECT * FROM {{ ref('stg_posts') }}

)

SELECT
    {{ dbt_utils.generate_surrogate_key(['p.post_natural_id', 'p.run_natural_id']) }} AS fct_post_key,
    coalesce(dp.post_key, '-1') AS post_key,
    coalesce(da.author_key, '-1') AS author_key,
    coalesce(ds.subreddit_key, '-1') AS subreddit_key,
    coalesce(dpf.post_flair_key, '-1') AS post_flair_key,
    coalesce(dd_posted.date_key, '-1') AS posted_date_key,
    coalesce(dd_fetched.date_key, '-1') AS fetched_date_key,
    coalesce(dfr.fetch_run_key, '-1') AS fetch_run_key,
    p.post_natural_id,
    p.score,
    p.upvote_ratio,
    p.num_comments,
    cast(1 AS int) AS post_count
FROM posts p
LEFT JOIN {{ ref('dim_post') }} dp ON dp.post_natural_id = p.post_natural_id
LEFT JOIN {{ ref('dim_author') }} da ON da.author_natural_id = p.author_natural_id
LEFT JOIN {{ ref('dim_subreddit') }} ds ON ds.subreddit_natural_id = p.subreddit_natural_id
LEFT JOIN {{ ref('dim_post_flair') }} dpf ON dpf.flair_text = p.flair_text
LEFT JOIN {{ ref('dim_date') }} dd_posted ON dd_posted.date_key = date_format(p.posted_at, 'yyyyMMdd')
LEFT JOIN {{ ref('dim_date') }} dd_fetched ON dd_fetched.date_key = date_format(p.fetched_at, 'yyyyMMdd')
LEFT JOIN {{ ref('dim_fetch_run') }} dfr ON dfr.run_natural_id = p.run_natural_id
