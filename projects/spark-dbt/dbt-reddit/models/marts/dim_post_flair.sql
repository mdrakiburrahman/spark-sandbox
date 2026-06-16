with flairs as (

    select distinct
        flair_text,
        flair_category
    from {{ ref('stg_posts') }}

)

select
    {{ dbt_utils.generate_surrogate_key(['flair_text']) }} as post_flair_key,
    flair_text,
    flair_category
from flairs

union all

select
    '-1'                  as post_flair_key,
    'Unknown'             as flair_text,
    cast(null as string)  as flair_category
