WITH stg AS (

    SELECT * FROM {{ ref('stg_subreddits') }}

),

deduped AS (

    SELECT
        *,
        row_number() OVER (
            PARTITION BY subreddit_natural_id
            ORDER BY fetched_at DESC NULLS LAST, run_natural_id DESC NULLS LAST
        ) AS _row_num
    FROM stg

)

SELECT
    {{ dbt_utils.generate_surrogate_key(['subreddit_natural_id']) }} AS subreddit_key,
    subreddit_natural_id,
    display_name,
    subscribers,
    fetched_at
FROM deduped
WHERE _row_num = 1

UNION ALL

SELECT
    '-1' AS subreddit_key,
    'UNKNOWN' AS subreddit_natural_id,
    'Unknown' AS display_name,
    cast(NULL AS int) AS subscribers,
    cast(NULL AS timestamp) AS fetched_at
