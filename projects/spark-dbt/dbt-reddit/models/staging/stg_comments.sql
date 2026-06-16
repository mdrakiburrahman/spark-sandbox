WITH source AS (

    SELECT * FROM {{ source('reddit_raw', 'comments') }}

)

SELECT
    id AS comment_natural_id,
    post_id AS post_natural_id,
    author_id AS author_natural_id,
    parent_id,
    body,
    score,
    depth,
    coalesce(is_submitter, FALSE) AS is_submitter,
    coalesce(stickied, FALSE) AS stickied,
    created_utc AS commented_at,
    edited_utc AS edited_at,
    fetch_run_id AS run_natural_id,
    fetched_at,
    substr(parent_id, 1, 3) = 't3_' AS is_reply_to_post,
    substr(parent_id, 1, 3) = 't1_' AS is_reply_to_comment
FROM source
WHERE id IS NOT NULL
