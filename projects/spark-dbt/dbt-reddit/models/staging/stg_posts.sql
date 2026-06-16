with source as (

    select * from {{ source('reddit_raw', 'posts') }}

),

renamed as (

    select
        id            as post_natural_id,
        short_id,
        title,
        selftext,
        url,
        permalink,
        coalesce(is_self, false)   as is_self,
        coalesce(over_18, false)   as over_18,
        coalesce(stickied, false)  as stickied,
        coalesce(locked, false)    as locked,
        created_utc   as posted_at,
        author_id     as author_natural_id,
        subreddit_id  as subreddit_natural_id,
        fetch_run_id  as run_natural_id,
        fetched_at,
        score,
        upvote_ratio,
        num_comments,
        coalesce(nullif(trim(flair_text), ''), '(Uncategorized)') as flair_text
    from source
    where id is not null

)

select
    *,
    case
        when flair_text = '(Uncategorized)' then '(Uncategorized)'
        when lower(flair_text) like '%power bi%' then 'Power BI'
        when lower(flair_text) like '%data engineer%'
            or lower(flair_text) like '%data factory%'
            or lower(flair_text) like '%data warehouse%'
            or lower(flair_text) like '%data science%'
            or lower(flair_text) like '%real-time%'
            or lower(flair_text) like '%real time%'
            or lower(flair_text) like '%database%' then 'Data Workloads'
        when lower(flair_text) like '%community%'
            or lower(flair_text) like '%discussion%'
            or lower(flair_text) like '%request%' then 'Community'
        when lower(flair_text) like '%solved%'
            or lower(flair_text) like '%help%'
            or lower(flair_text) like '%support%' then 'Support'
        else 'Other'
    end as flair_category
from renamed
