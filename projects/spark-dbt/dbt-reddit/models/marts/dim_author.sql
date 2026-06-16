with stg_authors as (

    select * from {{ ref('stg_authors') }}

),

deduped as (

    select
        *,
        row_number() over (
            partition by author_natural_id
            order by fetched_at desc nulls last, run_natural_id desc nulls last
        ) as _row_num
    from stg_authors

),

employees as (

    select * from {{ ref('stg_microsoft_employees') }}

)

select
    {{ dbt_utils.generate_surrogate_key(['a.author_natural_id']) }} as author_key,
    a.author_natural_id,
    a.author_name,
    a.is_deleted,
    e.username_lc is not null                                        as is_microsoft_employee,
    e.msft_username,
    e.msft_job_title,
    e.msft_department,
    coalesce(lower(e.msft_job_title) like '%product manager%', false) as is_product_manager,
    a.fetched_at
from deduped a
left join employees e on lower(a.author_name) = e.username_lc
where a._row_num = 1

union all

select
    '-1'                     as author_key,
    'UNKNOWN'                as author_natural_id,
    'Unknown'                as author_name,
    cast(true as boolean)    as is_deleted,
    cast(false as boolean)   as is_microsoft_employee,
    cast(null as string)     as msft_username,
    cast(null as string)     as msft_job_title,
    cast(null as string)     as msft_department,
    cast(false as boolean)   as is_product_manager,
    cast(null as timestamp)  as fetched_at
