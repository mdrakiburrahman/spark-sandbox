with source as (

    select * from {{ source('reddit_raw', 'authors') }}

)

select
    id            as author_natural_id,
    name          as author_name,
    coalesce(is_deleted, false) as is_deleted,
    fetched_at,
    fetch_run_id  as run_natural_id
from source
where id is not null
