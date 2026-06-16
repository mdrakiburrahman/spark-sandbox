with posts as (

    select
        *,
        row_number() over (
            partition by post_natural_id
            order by fetched_at desc nulls last, run_natural_id desc nulls last
        ) as _row_num
    from {{ ref('stg_posts') }}

),

latest as (

    select * from posts where _row_num = 1

)

select
    {{ dbt_utils.generate_surrogate_key(['l.post_natural_id']) }} as post_key,
    l.post_natural_id,
    l.short_id,
    l.title,
    l.selftext,
    l.url,
    l.permalink,
    l.is_self,
    l.over_18,
    l.posted_at,
    coalesce(dd.date_key, '-1')        as posted_date_key,
    coalesce(da.author_key, '-1')      as author_key,
    coalesce(ds.subreddit_key, '-1')   as subreddit_key,
    coalesce(dpf.post_flair_key, '-1') as post_flair_key
from latest l
left join {{ ref('dim_date') }}       dd  on dd.date_key = date_format(l.posted_at, 'yyyyMMdd')
left join {{ ref('dim_author') }}     da  on da.author_natural_id = l.author_natural_id
left join {{ ref('dim_subreddit') }}  ds  on ds.subreddit_natural_id = l.subreddit_natural_id
left join {{ ref('dim_post_flair') }} dpf on dpf.flair_text = l.flair_text

union all

select
    '-1'                    as post_key,
    'UNKNOWN'               as post_natural_id,
    cast(null as string)    as short_id,
    'Unknown'               as title,
    cast(null as string)    as selftext,
    cast(null as string)    as url,
    cast(null as string)    as permalink,
    cast(false as boolean)  as is_self,
    cast(false as boolean)  as over_18,
    cast(null as timestamp) as posted_at,
    '-1'                    as posted_date_key,
    '-1'                    as author_key,
    '-1'                    as subreddit_key,
    '-1'                    as post_flair_key
