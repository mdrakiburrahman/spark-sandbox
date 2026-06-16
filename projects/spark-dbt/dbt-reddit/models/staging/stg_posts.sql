WITH source AS (

    SELECT * FROM {{ source('reddit_raw', 'posts') }}

),

renamed AS (

    SELECT
        id AS post_natural_id,
        short_id,
        title,
        selftext,
        url,
        permalink,
        coalesce(is_self, FALSE) AS is_self,
        coalesce(over_18, FALSE) AS over_18,
        coalesce(stickied, FALSE) AS stickied,
        coalesce(locked, FALSE) AS locked,
        created_utc AS posted_at,
        author_id AS author_natural_id,
        subreddit_id AS subreddit_natural_id,
        fetch_run_id AS run_natural_id,
        fetched_at,
        score,
        upvote_ratio,
        num_comments,
        coalesce(nullif(trim(flair_text), ''), '(Uncategorized)') AS flair_text
    FROM source
    WHERE id IS NOT NULL

)

SELECT
    *,
    CASE
        WHEN flair_text = '(Uncategorized)' THEN '(Uncategorized)'
        WHEN lower(flair_text) LIKE '%power bi%' THEN 'Power BI'
        WHEN
            lower(flair_text) LIKE '%data engineer%'
            OR lower(flair_text) LIKE '%data factory%'
            OR lower(flair_text) LIKE '%data warehouse%'
            OR lower(flair_text) LIKE '%data science%'
            OR lower(flair_text) LIKE '%real-time%'
            OR lower(flair_text) LIKE '%real time%'
            OR lower(flair_text) LIKE '%database%' THEN 'Data Workloads'
        WHEN
            lower(flair_text) LIKE '%community%'
            OR lower(flair_text) LIKE '%discussion%'
            OR lower(flair_text) LIKE '%request%' THEN 'Community'
        WHEN
            lower(flair_text) LIKE '%solved%'
            OR lower(flair_text) LIKE '%help%'
            OR lower(flair_text) LIKE '%support%' THEN 'Support'
        ELSE 'Other'
    END AS flair_category
FROM renamed
