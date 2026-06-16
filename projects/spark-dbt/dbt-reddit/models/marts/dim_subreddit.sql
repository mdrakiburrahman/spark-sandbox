with stg as (

    select * from {{ ref('stg_subreddits') }}

),

deduped as (

    select
        *,
        row_number() over (
            partition by subreddit_natural_id
            order by fetched_at desc nulls last, run_natural_id desc nulls last
        ) as _row_num
    from stg

)

select
    {{ dbt_utils.generate_surrogate_key(['subreddit_natural_id']) }} as subreddit_key,
    subreddit_natural_id,
    display_name,
    subscribers,
    fetched_at
from deduped
where _row_num = 1

union all

select
    '-1'                     as subreddit_key,
    'UNKNOWN'                as subreddit_natural_id,
    'Unknown'                as display_name,
    cast(null as int)        as subscribers,
    cast(null as timestamp)  as fetched_at
