WITH posts AS (

    SELECT
        *,
        row_number() OVER (
            PARTITION BY post_natural_id
            ORDER BY fetched_at DESC NULLS LAST, run_natural_id DESC NULLS LAST
        ) AS _row_num
    FROM {{ ref('stg_posts') }}

),

latest AS (

    SELECT * FROM posts WHERE _row_num = 1

)

SELECT
    {{ dbt_utils.generate_surrogate_key(['l.post_natural_id']) }} AS post_key,
    l.post_natural_id,
    l.short_id,
    l.title,
    l.selftext,
    l.url,
    l.permalink,
    l.is_self,
    l.over_18,
    l.posted_at,
    coalesce(dd.date_key, '-1') AS posted_date_key,
    coalesce(da.author_key, '-1') AS author_key,
    coalesce(ds.subreddit_key, '-1') AS subreddit_key,
    coalesce(dpf.post_flair_key, '-1') AS post_flair_key
FROM latest l
LEFT JOIN {{ ref('dim_date') }} dd ON dd.date_key = date_format(l.posted_at, 'yyyyMMdd')
LEFT JOIN {{ ref('dim_author') }} da ON da.author_natural_id = l.author_natural_id
LEFT JOIN {{ ref('dim_subreddit') }} ds ON ds.subreddit_natural_id = l.subreddit_natural_id
LEFT JOIN {{ ref('dim_post_flair') }} dpf ON dpf.flair_text = l.flair_text

UNION ALL

SELECT
    '-1' AS post_key,
    'UNKNOWN' AS post_natural_id,
    cast(NULL AS string) AS short_id,
    'Unknown' AS title,
    cast(NULL AS string) AS selftext,
    cast(NULL AS string) AS url,
    cast(NULL AS string) AS permalink,
    cast(FALSE AS boolean) AS is_self,
    cast(FALSE AS boolean) AS over_18,
    cast(NULL AS timestamp) AS posted_at,
    '-1' AS posted_date_key,
    '-1' AS author_key,
    '-1' AS subreddit_key,
    '-1' AS post_flair_key
