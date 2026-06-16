with source as (

    select * from {{ source('reddit_raw', 'microsoft_employees') }}

)

select
    lower(username)  as username_lc,
    max(username)    as msft_username,
    max(job_title)   as msft_job_title,
    max(department)  as msft_department
from source
where username is not null
group by lower(username)
