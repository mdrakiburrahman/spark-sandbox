WITH source AS (

    SELECT * FROM {{ source('reddit_raw', 'microsoft_employees') }}

)

SELECT
    lower(username) AS username_lc,
    max(username) AS msft_username,
    max(job_title) AS msft_job_title,
    max(department) AS msft_department
FROM source
WHERE username IS NOT NULL
GROUP BY lower(username)
