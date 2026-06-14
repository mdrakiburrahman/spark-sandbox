# Fabric notebook source

# METADATA ********************

# META {
# META   "kernel_info": {
# META     "name": "synapse_pyspark"
# META   },
# META   "dependencies": {
# META     "lakehouse": {
# META       "default_lakehouse": "fe264fce-f024-4d25-8538-d30aae290ee1",
# META       "default_lakehouse_name": "reddit_db",
# META       "default_lakehouse_workspace_id": "063d94c2-4246-4229-84a1-064595ea46b2",
# META       "known_lakehouses": [
# META         {
# META           "id": "fe264fce-f024-4d25-8538-d30aae290ee1"
# META         }
# META       ]
# META     }
# META   }
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC CREATE SCHEMA IF NOT EXISTS gold


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC CREATE OR REPLACE TABLE gold._stg_dim_date (
# MAGIC   date_key INT,
# MAGIC   full_date DATE,
# MAGIC   year INT,
# MAGIC   quarter INT,
# MAGIC   month INT,
# MAGIC   month_name STRING,
# MAGIC   day INT,
# MAGIC   day_of_week INT,
# MAGIC   day_name STRING,
# MAGIC   week_of_year INT,
# MAGIC   is_weekend BOOLEAN
# MAGIC ) USING DELTA


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC CREATE OR REPLACE TABLE gold._stg_dim_author (
# MAGIC   author_key BIGINT,
# MAGIC   author_id STRING,
# MAGIC   author_name STRING,
# MAGIC   is_deleted BOOLEAN,
# MAGIC   is_microsoft_employee BOOLEAN,
# MAGIC   employee_job_title STRING,
# MAGIC   employee_department STRING,
# MAGIC   first_seen_at TIMESTAMP,
# MAGIC   last_seen_at TIMESTAMP
# MAGIC ) USING DELTA


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC CREATE OR REPLACE TABLE gold._stg_dim_subreddit (
# MAGIC   subreddit_key BIGINT,
# MAGIC   subreddit_id STRING,
# MAGIC   display_name STRING,
# MAGIC   subscribers INT,
# MAGIC   created_utc TIMESTAMP,
# MAGIC   first_seen_at TIMESTAMP,
# MAGIC   last_seen_at TIMESTAMP
# MAGIC ) USING DELTA


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC CREATE OR REPLACE TABLE gold._stg_dim_post_flair (
# MAGIC   post_flair_key BIGINT,
# MAGIC   flair_text STRING
# MAGIC ) USING DELTA


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC CREATE OR REPLACE TABLE gold._stg_dim_post (
# MAGIC   post_key BIGINT,
# MAGIC   post_id STRING,
# MAGIC   short_id STRING,
# MAGIC   title STRING,
# MAGIC   selftext STRING,
# MAGIC   url STRING,
# MAGIC   permalink STRING,
# MAGIC   is_self BOOLEAN,
# MAGIC   over_18 BOOLEAN,
# MAGIC   stickied BOOLEAN,
# MAGIC   locked BOOLEAN,
# MAGIC   created_utc TIMESTAMP
# MAGIC ) USING DELTA


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC CREATE OR REPLACE TABLE gold._stg_dim_fetch_run (
# MAGIC   fetch_run_key BIGINT,
# MAGIC   run_id BIGINT,
# MAGIC   subreddit STRING,
# MAGIC   listing_type STRING,
# MAGIC   time_window STRING,
# MAGIC   limit_requested INT,
# MAGIC   skip_comments BOOLEAN,
# MAGIC   started_at TIMESTAMP,
# MAGIC   finished_at TIMESTAMP,
# MAGIC   posts_ingested INT,
# MAGIC   comments_ingested INT,
# MAGIC   more_calls BIGINT,
# MAGIC   subreddits_seen INT,
# MAGIC   authors_seen INT
# MAGIC ) USING DELTA


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC CREATE OR REPLACE TABLE gold._stg_fct_post (
# MAGIC   post_key BIGINT,
# MAGIC   date_key INT,
# MAGIC   author_key BIGINT,
# MAGIC   subreddit_key BIGINT,
# MAGIC   post_flair_key BIGINT,
# MAGIC   fetch_run_key BIGINT,
# MAGIC   score INT,
# MAGIC   upvote_ratio DOUBLE,
# MAGIC   num_comments INT
# MAGIC ) USING DELTA


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC CREATE OR REPLACE TABLE gold._stg_fct_comment (
# MAGIC   comment_id STRING,
# MAGIC   post_key BIGINT,
# MAGIC   date_key INT,
# MAGIC   author_key BIGINT,
# MAGIC   fetch_run_key BIGINT,
# MAGIC   parent_id STRING,
# MAGIC   body STRING,
# MAGIC   score INT,
# MAGIC   depth INT,
# MAGIC   is_submitter BOOLEAN,
# MAGIC   stickied BOOLEAN,
# MAGIC   created_utc TIMESTAMP,
# MAGIC   edited_utc TIMESTAMP
# MAGIC ) USING DELTA


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC INSERT OVERWRITE TABLE gold._stg_dim_date
# MAGIC WITH source_dates AS (
# MAGIC   SELECT to_date(created_utc) AS full_date FROM dbo.posts WHERE created_utc IS NOT NULL
# MAGIC   UNION
# MAGIC   SELECT to_date(fetched_at) AS full_date FROM dbo.posts WHERE fetched_at IS NOT NULL
# MAGIC   UNION
# MAGIC   SELECT to_date(created_utc) AS full_date FROM dbo.comments WHERE created_utc IS NOT NULL
# MAGIC   UNION
# MAGIC   SELECT to_date(edited_utc) AS full_date FROM dbo.comments WHERE edited_utc IS NOT NULL
# MAGIC   UNION
# MAGIC   SELECT to_date(fetched_at) AS full_date FROM dbo.comments WHERE fetched_at IS NOT NULL
# MAGIC   UNION
# MAGIC   SELECT to_date(started_at) AS full_date FROM dbo.fetch_runs WHERE started_at IS NOT NULL
# MAGIC   UNION
# MAGIC   SELECT to_date(finished_at) AS full_date FROM dbo.fetch_runs WHERE finished_at IS NOT NULL
# MAGIC ), typed_dates AS (
# MAGIC   SELECT CAST(date_format(full_date, 'yyyyMMdd') AS INT) AS date_key,
# MAGIC          CAST(full_date AS DATE) AS full_date,
# MAGIC          CAST(year(full_date) AS INT) AS year,
# MAGIC          CAST(quarter(full_date) AS INT) AS quarter,
# MAGIC          CAST(month(full_date) AS INT) AS month,
# MAGIC          CAST(date_format(full_date, 'MMMM') AS STRING) AS month_name,
# MAGIC          CAST(day(full_date) AS INT) AS day,
# MAGIC          CAST(dayofweek(full_date) AS INT) AS day_of_week,
# MAGIC          CAST(date_format(full_date, 'EEEE') AS STRING) AS day_name,
# MAGIC          CAST(weekofyear(full_date) AS INT) AS week_of_year,
# MAGIC          CAST(CASE WHEN dayofweek(full_date) IN (1, 7) THEN true ELSE false END AS BOOLEAN) AS is_weekend
# MAGIC   FROM source_dates
# MAGIC )
# MAGIC SELECT CAST(-1 AS INT) AS date_key,
# MAGIC        CAST(DATE '1900-01-01' AS DATE) AS full_date,
# MAGIC        CAST(-1 AS INT) AS year,
# MAGIC        CAST(-1 AS INT) AS quarter,
# MAGIC        CAST(-1 AS INT) AS month,
# MAGIC        CAST('Unknown' AS STRING) AS month_name,
# MAGIC        CAST(-1 AS INT) AS day,
# MAGIC        CAST(-1 AS INT) AS day_of_week,
# MAGIC        CAST('Unknown' AS STRING) AS day_name,
# MAGIC        CAST(-1 AS INT) AS week_of_year,
# MAGIC        CAST(false AS BOOLEAN) AS is_weekend
# MAGIC UNION ALL
# MAGIC SELECT date_key, full_date, year, quarter, month, month_name, day, day_of_week, day_name, week_of_year, is_weekend
# MAGIC FROM typed_dates


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC INSERT OVERWRITE TABLE gold._stg_dim_author
# MAGIC WITH author_ids AS (
# MAGIC   SELECT id AS author_id FROM dbo.authors WHERE id IS NOT NULL
# MAGIC   UNION SELECT author_id FROM dbo.posts WHERE author_id IS NOT NULL
# MAGIC   UNION SELECT author_id FROM dbo.comments WHERE author_id IS NOT NULL
# MAGIC ), author_ranked AS (
# MAGIC   SELECT id AS author_id,
# MAGIC          name AS author_name,
# MAGIC          is_deleted,
# MAGIC          fetched_at,
# MAGIC          ROW_NUMBER() OVER (PARTITION BY id ORDER BY fetched_at ASC NULLS LAST, name ASC NULLS LAST) AS rn
# MAGIC   FROM dbo.authors
# MAGIC   WHERE id IS NOT NULL
# MAGIC ), author_agg AS (
# MAGIC   SELECT ids.author_id,
# MAGIC          MAX(CASE WHEN ar.rn = 1 THEN ar.author_name END) AS author_name,
# MAGIC          CAST(MAX(CASE WHEN COALESCE(ar.is_deleted, false) THEN 1 ELSE 0 END) AS BOOLEAN) AS is_deleted,
# MAGIC          MIN(ar.fetched_at) AS first_seen_at,
# MAGIC          MAX(ar.fetched_at) AS last_seen_at
# MAGIC   FROM author_ids ids
# MAGIC   LEFT JOIN author_ranked ar ON ids.author_id = ar.author_id
# MAGIC   GROUP BY ids.author_id
# MAGIC ), employee_ranked AS (
# MAGIC   SELECT lower(username) AS username_lc,
# MAGIC          job_title,
# MAGIC          department,
# MAGIC          ROW_NUMBER() OVER (PARTITION BY lower(username) ORDER BY seed_ingest_time DESC NULLS LAST, username ASC) AS rn
# MAGIC   FROM dbo.microsoft_employees
# MAGIC   WHERE username IS NOT NULL
# MAGIC ), natural_rows AS (
# MAGIC   SELECT CAST(ROW_NUMBER() OVER (ORDER BY a.author_id) AS BIGINT) AS author_key,
# MAGIC          CAST(a.author_id AS STRING) AS author_id,
# MAGIC          CAST(a.author_name AS STRING) AS author_name,
# MAGIC          CAST(COALESCE(a.is_deleted, false) AS BOOLEAN) AS is_deleted,
# MAGIC          CAST(CASE WHEN e.username_lc IS NOT NULL THEN true ELSE false END AS BOOLEAN) AS is_microsoft_employee,
# MAGIC          CAST(e.job_title AS STRING) AS employee_job_title,
# MAGIC          CAST(e.department AS STRING) AS employee_department,
# MAGIC          CAST(a.first_seen_at AS TIMESTAMP) AS first_seen_at,
# MAGIC          CAST(a.last_seen_at AS TIMESTAMP) AS last_seen_at
# MAGIC   FROM author_agg a
# MAGIC   LEFT JOIN employee_ranked e ON lower(a.author_name) = e.username_lc AND e.rn = 1
# MAGIC )
# MAGIC SELECT CAST(-1 AS BIGINT) AS author_key,
# MAGIC        CAST('UNKNOWN' AS STRING) AS author_id,
# MAGIC        CAST('Unknown' AS STRING) AS author_name,
# MAGIC        CAST(false AS BOOLEAN) AS is_deleted,
# MAGIC        CAST(false AS BOOLEAN) AS is_microsoft_employee,
# MAGIC        CAST(NULL AS STRING) AS employee_job_title,
# MAGIC        CAST(NULL AS STRING) AS employee_department,
# MAGIC        CAST(NULL AS TIMESTAMP) AS first_seen_at,
# MAGIC        CAST(NULL AS TIMESTAMP) AS last_seen_at
# MAGIC UNION ALL
# MAGIC SELECT author_key, author_id, author_name, is_deleted, is_microsoft_employee,
# MAGIC        employee_job_title, employee_department, first_seen_at, last_seen_at
# MAGIC FROM natural_rows


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC INSERT OVERWRITE TABLE gold._stg_dim_subreddit
# MAGIC WITH subreddit_ids AS (
# MAGIC   SELECT id AS subreddit_id FROM dbo.subreddits WHERE id IS NOT NULL
# MAGIC   UNION SELECT subreddit_id FROM dbo.posts WHERE subreddit_id IS NOT NULL
# MAGIC ), subreddit_ranked AS (
# MAGIC   SELECT id AS subreddit_id,
# MAGIC          display_name,
# MAGIC          subscribers,
# MAGIC          created_utc,
# MAGIC          fetched_at,
# MAGIC          ROW_NUMBER() OVER (PARTITION BY id ORDER BY fetched_at DESC NULLS LAST, display_name ASC NULLS LAST) AS rn
# MAGIC   FROM dbo.subreddits
# MAGIC   WHERE id IS NOT NULL
# MAGIC ), subreddit_agg AS (
# MAGIC   SELECT ids.subreddit_id,
# MAGIC          MAX(CASE WHEN sr.rn = 1 THEN sr.display_name END) AS display_name,
# MAGIC          MAX(CASE WHEN sr.rn = 1 THEN sr.subscribers END) AS subscribers,
# MAGIC          MIN(sr.created_utc) AS created_utc,
# MAGIC          MIN(sr.fetched_at) AS first_seen_at,
# MAGIC          MAX(sr.fetched_at) AS last_seen_at
# MAGIC   FROM subreddit_ids ids
# MAGIC   LEFT JOIN subreddit_ranked sr ON ids.subreddit_id = sr.subreddit_id
# MAGIC   GROUP BY ids.subreddit_id
# MAGIC ), natural_rows AS (
# MAGIC   SELECT CAST(ROW_NUMBER() OVER (ORDER BY subreddit_id) AS BIGINT) AS subreddit_key,
# MAGIC          CAST(subreddit_id AS STRING) AS subreddit_id,
# MAGIC          CAST(display_name AS STRING) AS display_name,
# MAGIC          CAST(subscribers AS INT) AS subscribers,
# MAGIC          CAST(created_utc AS TIMESTAMP) AS created_utc,
# MAGIC          CAST(first_seen_at AS TIMESTAMP) AS first_seen_at,
# MAGIC          CAST(last_seen_at AS TIMESTAMP) AS last_seen_at
# MAGIC   FROM subreddit_agg
# MAGIC )
# MAGIC SELECT CAST(-1 AS BIGINT) AS subreddit_key,
# MAGIC        CAST('UNKNOWN' AS STRING) AS subreddit_id,
# MAGIC        CAST('Unknown' AS STRING) AS display_name,
# MAGIC        CAST(NULL AS INT) AS subscribers,
# MAGIC        CAST(NULL AS TIMESTAMP) AS created_utc,
# MAGIC        CAST(NULL AS TIMESTAMP) AS first_seen_at,
# MAGIC        CAST(NULL AS TIMESTAMP) AS last_seen_at
# MAGIC UNION ALL
# MAGIC SELECT subreddit_key, subreddit_id, display_name, subscribers, created_utc, first_seen_at, last_seen_at
# MAGIC FROM natural_rows


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC INSERT OVERWRITE TABLE gold._stg_dim_post_flair
# MAGIC WITH flair_base AS (
# MAGIC   SELECT DISTINCT CAST(flair_text AS STRING) AS flair_text
# MAGIC   FROM dbo.posts
# MAGIC   WHERE flair_text IS NOT NULL
# MAGIC ), natural_rows AS (
# MAGIC   SELECT CAST(ROW_NUMBER() OVER (ORDER BY flair_text) AS BIGINT) AS post_flair_key,
# MAGIC          CAST(flair_text AS STRING) AS flair_text
# MAGIC   FROM flair_base
# MAGIC )
# MAGIC SELECT CAST(-1 AS BIGINT) AS post_flair_key,
# MAGIC        CAST('Unknown' AS STRING) AS flair_text
# MAGIC UNION ALL
# MAGIC SELECT post_flair_key, flair_text
# MAGIC FROM natural_rows


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC INSERT OVERWRITE TABLE gold._stg_dim_post
# MAGIC WITH post_ranked AS (
# MAGIC   SELECT *,
# MAGIC          ROW_NUMBER() OVER (PARTITION BY id ORDER BY fetched_at DESC NULLS LAST, created_utc DESC NULLS LAST, short_id ASC NULLS LAST) AS rn
# MAGIC   FROM dbo.posts
# MAGIC   WHERE id IS NOT NULL
# MAGIC ), natural_rows AS (
# MAGIC   SELECT CAST(ROW_NUMBER() OVER (ORDER BY id) AS BIGINT) AS post_key,
# MAGIC          CAST(id AS STRING) AS post_id,
# MAGIC          CAST(short_id AS STRING) AS short_id,
# MAGIC          CAST(title AS STRING) AS title,
# MAGIC          CAST(selftext AS STRING) AS selftext,
# MAGIC          CAST(url AS STRING) AS url,
# MAGIC          CAST(permalink AS STRING) AS permalink,
# MAGIC          CAST(is_self AS BOOLEAN) AS is_self,
# MAGIC          CAST(over_18 AS BOOLEAN) AS over_18,
# MAGIC          CAST(stickied AS BOOLEAN) AS stickied,
# MAGIC          CAST(locked AS BOOLEAN) AS locked,
# MAGIC          CAST(created_utc AS TIMESTAMP) AS created_utc
# MAGIC   FROM post_ranked
# MAGIC   WHERE rn = 1
# MAGIC )
# MAGIC SELECT CAST(-1 AS BIGINT) AS post_key,
# MAGIC        CAST('UNKNOWN' AS STRING) AS post_id,
# MAGIC        CAST(NULL AS STRING) AS short_id,
# MAGIC        CAST('Unknown' AS STRING) AS title,
# MAGIC        CAST(NULL AS STRING) AS selftext,
# MAGIC        CAST(NULL AS STRING) AS url,
# MAGIC        CAST(NULL AS STRING) AS permalink,
# MAGIC        CAST(NULL AS BOOLEAN) AS is_self,
# MAGIC        CAST(NULL AS BOOLEAN) AS over_18,
# MAGIC        CAST(NULL AS BOOLEAN) AS stickied,
# MAGIC        CAST(NULL AS BOOLEAN) AS locked,
# MAGIC        CAST(NULL AS TIMESTAMP) AS created_utc
# MAGIC UNION ALL
# MAGIC SELECT post_key, post_id, short_id, title, selftext, url, permalink,
# MAGIC        is_self, over_18, stickied, locked, created_utc
# MAGIC FROM natural_rows


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC INSERT OVERWRITE TABLE gold._stg_dim_fetch_run
# MAGIC WITH run_ids AS (
# MAGIC   SELECT run_id FROM dbo.fetch_runs WHERE run_id IS NOT NULL
# MAGIC   UNION SELECT fetch_run_id AS run_id FROM dbo.posts WHERE fetch_run_id IS NOT NULL
# MAGIC   UNION SELECT fetch_run_id AS run_id FROM dbo.comments WHERE fetch_run_id IS NOT NULL
# MAGIC ), run_ranked AS (
# MAGIC   SELECT *, ROW_NUMBER() OVER (PARTITION BY run_id ORDER BY started_at DESC NULLS LAST, finished_at DESC NULLS LAST) AS rn
# MAGIC   FROM dbo.fetch_runs
# MAGIC   WHERE run_id IS NOT NULL
# MAGIC ), run_agg AS (
# MAGIC   SELECT ids.run_id,
# MAGIC          MAX(CASE WHEN rr.rn = 1 THEN rr.subreddit END) AS subreddit,
# MAGIC          MAX(CASE WHEN rr.rn = 1 THEN rr.listing_type END) AS listing_type,
# MAGIC          MAX(CASE WHEN rr.rn = 1 THEN rr.time_window END) AS time_window,
# MAGIC          MAX(CASE WHEN rr.rn = 1 THEN rr.limit_requested END) AS limit_requested,
# MAGIC          CAST(MAX(CASE WHEN rr.rn = 1 AND COALESCE(rr.skip_comments, false) THEN 1 ELSE 0 END) AS BOOLEAN) AS skip_comments,
# MAGIC          MAX(CASE WHEN rr.rn = 1 THEN rr.started_at END) AS started_at,
# MAGIC          MAX(CASE WHEN rr.rn = 1 THEN rr.finished_at END) AS finished_at,
# MAGIC          MAX(CASE WHEN rr.rn = 1 THEN rr.posts_ingested END) AS posts_ingested,
# MAGIC          MAX(CASE WHEN rr.rn = 1 THEN rr.comments_ingested END) AS comments_ingested,
# MAGIC          MAX(CASE WHEN rr.rn = 1 THEN rr.more_calls END) AS more_calls,
# MAGIC          MAX(CASE WHEN rr.rn = 1 THEN rr.subreddits_seen END) AS subreddits_seen,
# MAGIC          MAX(CASE WHEN rr.rn = 1 THEN rr.authors_seen END) AS authors_seen
# MAGIC   FROM run_ids ids
# MAGIC   LEFT JOIN run_ranked rr ON ids.run_id = rr.run_id
# MAGIC   GROUP BY ids.run_id
# MAGIC ), natural_rows AS (
# MAGIC   SELECT CAST(ROW_NUMBER() OVER (ORDER BY run_id) AS BIGINT) AS fetch_run_key,
# MAGIC          CAST(run_id AS BIGINT) AS run_id,
# MAGIC          CAST(subreddit AS STRING) AS subreddit,
# MAGIC          CAST(listing_type AS STRING) AS listing_type,
# MAGIC          CAST(time_window AS STRING) AS time_window,
# MAGIC          CAST(limit_requested AS INT) AS limit_requested,
# MAGIC          CAST(skip_comments AS BOOLEAN) AS skip_comments,
# MAGIC          CAST(started_at AS TIMESTAMP) AS started_at,
# MAGIC          CAST(finished_at AS TIMESTAMP) AS finished_at,
# MAGIC          CAST(posts_ingested AS INT) AS posts_ingested,
# MAGIC          CAST(comments_ingested AS INT) AS comments_ingested,
# MAGIC          CAST(more_calls AS BIGINT) AS more_calls,
# MAGIC          CAST(subreddits_seen AS INT) AS subreddits_seen,
# MAGIC          CAST(authors_seen AS INT) AS authors_seen
# MAGIC   FROM run_agg
# MAGIC )
# MAGIC SELECT CAST(-1 AS BIGINT) AS fetch_run_key,
# MAGIC        CAST(-1 AS BIGINT) AS run_id,
# MAGIC        CAST('Unknown' AS STRING) AS subreddit,
# MAGIC        CAST(NULL AS STRING) AS listing_type,
# MAGIC        CAST(NULL AS STRING) AS time_window,
# MAGIC        CAST(NULL AS INT) AS limit_requested,
# MAGIC        CAST(NULL AS BOOLEAN) AS skip_comments,
# MAGIC        CAST(NULL AS TIMESTAMP) AS started_at,
# MAGIC        CAST(NULL AS TIMESTAMP) AS finished_at,
# MAGIC        CAST(NULL AS INT) AS posts_ingested,
# MAGIC        CAST(NULL AS INT) AS comments_ingested,
# MAGIC        CAST(NULL AS BIGINT) AS more_calls,
# MAGIC        CAST(NULL AS INT) AS subreddits_seen,
# MAGIC        CAST(NULL AS INT) AS authors_seen
# MAGIC UNION ALL
# MAGIC SELECT fetch_run_key, run_id, subreddit, listing_type, time_window, limit_requested, skip_comments,
# MAGIC        started_at, finished_at, posts_ingested, comments_ingested, more_calls, subreddits_seen, authors_seen
# MAGIC FROM natural_rows


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC INSERT OVERWRITE TABLE gold._stg_fct_post
# MAGIC SELECT CAST(COALESCE(dp.post_key, -1) AS BIGINT) AS post_key,
# MAGIC        CAST(COALESCE(dd.date_key, -1) AS INT) AS date_key,
# MAGIC        CAST(COALESCE(da.author_key, -1) AS BIGINT) AS author_key,
# MAGIC        CAST(COALESCE(ds.subreddit_key, -1) AS BIGINT) AS subreddit_key,
# MAGIC        CAST(COALESCE(dpf.post_flair_key, -1) AS BIGINT) AS post_flair_key,
# MAGIC        CAST(COALESCE(dfr.fetch_run_key, -1) AS BIGINT) AS fetch_run_key,
# MAGIC        CAST(p.score AS INT) AS score,
# MAGIC        CAST(p.upvote_ratio AS DOUBLE) AS upvote_ratio,
# MAGIC        CAST(p.num_comments AS INT) AS num_comments
# MAGIC FROM dbo.posts p
# MAGIC LEFT JOIN gold._stg_dim_post dp ON p.id = dp.post_id
# MAGIC LEFT JOIN gold._stg_dim_date dd ON to_date(p.created_utc) = dd.full_date
# MAGIC LEFT JOIN gold._stg_dim_author da ON p.author_id = da.author_id
# MAGIC LEFT JOIN gold._stg_dim_subreddit ds ON p.subreddit_id = ds.subreddit_id
# MAGIC LEFT JOIN gold._stg_dim_post_flair dpf ON p.flair_text = dpf.flair_text
# MAGIC LEFT JOIN gold._stg_dim_fetch_run dfr ON p.fetch_run_id = dfr.run_id


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC INSERT OVERWRITE TABLE gold._stg_fct_comment
# MAGIC SELECT CAST(c.id AS STRING) AS comment_id,
# MAGIC        CAST(COALESCE(dp.post_key, -1) AS BIGINT) AS post_key,
# MAGIC        CAST(COALESCE(dd.date_key, -1) AS INT) AS date_key,
# MAGIC        CAST(COALESCE(da.author_key, -1) AS BIGINT) AS author_key,
# MAGIC        CAST(COALESCE(dfr.fetch_run_key, -1) AS BIGINT) AS fetch_run_key,
# MAGIC        CAST(c.parent_id AS STRING) AS parent_id,
# MAGIC        CAST(c.body AS STRING) AS body,
# MAGIC        CAST(c.score AS INT) AS score,
# MAGIC        CAST(c.depth AS INT) AS depth,
# MAGIC        CAST(c.is_submitter AS BOOLEAN) AS is_submitter,
# MAGIC        CAST(c.stickied AS BOOLEAN) AS stickied,
# MAGIC        CAST(c.created_utc AS TIMESTAMP) AS created_utc,
# MAGIC        CAST(c.edited_utc AS TIMESTAMP) AS edited_utc
# MAGIC FROM dbo.comments c
# MAGIC LEFT JOIN gold._stg_dim_post dp ON c.post_id = dp.post_id
# MAGIC LEFT JOIN gold._stg_dim_date dd ON to_date(c.created_utc) = dd.full_date
# MAGIC LEFT JOIN gold._stg_dim_author da ON c.author_id = da.author_id
# MAGIC LEFT JOIN gold._stg_dim_fetch_run dfr ON c.fetch_run_id = dfr.run_id


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC WITH checks AS (
# MAGIC   SELECT 'posts_source_vs_stage_fact' AS check_name, CAST((SELECT COUNT(*) FROM dbo.posts) AS BIGINT) AS expected_count, CAST((SELECT COUNT(*) FROM gold._stg_fct_post) AS BIGINT) AS actual_count
# MAGIC   UNION ALL SELECT 'comments_source_vs_stage_fact', CAST((SELECT COUNT(*) FROM dbo.comments) AS BIGINT), CAST((SELECT COUNT(*) FROM gold._stg_fct_comment) AS BIGINT)
# MAGIC   UNION ALL SELECT 'unknown_dim_date', CAST(1 AS BIGINT), CAST((SELECT COUNT(*) FROM gold._stg_dim_date WHERE date_key = -1) AS BIGINT)
# MAGIC   UNION ALL SELECT 'unknown_dim_author', CAST(1 AS BIGINT), CAST((SELECT COUNT(*) FROM gold._stg_dim_author WHERE author_key = -1) AS BIGINT)
# MAGIC   UNION ALL SELECT 'unknown_dim_subreddit', CAST(1 AS BIGINT), CAST((SELECT COUNT(*) FROM gold._stg_dim_subreddit WHERE subreddit_key = -1) AS BIGINT)
# MAGIC   UNION ALL SELECT 'unknown_dim_post_flair', CAST(1 AS BIGINT), CAST((SELECT COUNT(*) FROM gold._stg_dim_post_flair WHERE post_flair_key = -1) AS BIGINT)
# MAGIC   UNION ALL SELECT 'unknown_dim_post', CAST(1 AS BIGINT), CAST((SELECT COUNT(*) FROM gold._stg_dim_post WHERE post_key = -1) AS BIGINT)
# MAGIC   UNION ALL SELECT 'unknown_dim_fetch_run', CAST(1 AS BIGINT), CAST((SELECT COUNT(*) FROM gold._stg_dim_fetch_run WHERE fetch_run_key = -1) AS BIGINT)
# MAGIC )
# MAGIC SELECT assert_true(COUNT_IF(expected_count <> actual_count) = 0, 'Stage clone validation failed') AS stage_validation_passed
# MAGIC FROM checks


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC CREATE OR REPLACE TABLE gold.dim_date (
# MAGIC   date_key INT,
# MAGIC   full_date DATE,
# MAGIC   year INT,
# MAGIC   quarter INT,
# MAGIC   month INT,
# MAGIC   month_name STRING,
# MAGIC   day INT,
# MAGIC   day_of_week INT,
# MAGIC   day_name STRING,
# MAGIC   week_of_year INT,
# MAGIC   is_weekend BOOLEAN
# MAGIC ) USING DELTA


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC CREATE OR REPLACE TABLE gold.dim_author (
# MAGIC   author_key BIGINT,
# MAGIC   author_id STRING,
# MAGIC   author_name STRING,
# MAGIC   is_deleted BOOLEAN,
# MAGIC   is_microsoft_employee BOOLEAN,
# MAGIC   employee_job_title STRING,
# MAGIC   employee_department STRING,
# MAGIC   first_seen_at TIMESTAMP,
# MAGIC   last_seen_at TIMESTAMP
# MAGIC ) USING DELTA


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC CREATE OR REPLACE TABLE gold.dim_subreddit (
# MAGIC   subreddit_key BIGINT,
# MAGIC   subreddit_id STRING,
# MAGIC   display_name STRING,
# MAGIC   subscribers INT,
# MAGIC   created_utc TIMESTAMP,
# MAGIC   first_seen_at TIMESTAMP,
# MAGIC   last_seen_at TIMESTAMP
# MAGIC ) USING DELTA


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC CREATE OR REPLACE TABLE gold.dim_post_flair (
# MAGIC   post_flair_key BIGINT,
# MAGIC   flair_text STRING
# MAGIC ) USING DELTA


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC CREATE OR REPLACE TABLE gold.dim_post (
# MAGIC   post_key BIGINT,
# MAGIC   post_id STRING,
# MAGIC   short_id STRING,
# MAGIC   title STRING,
# MAGIC   selftext STRING,
# MAGIC   url STRING,
# MAGIC   permalink STRING,
# MAGIC   is_self BOOLEAN,
# MAGIC   over_18 BOOLEAN,
# MAGIC   stickied BOOLEAN,
# MAGIC   locked BOOLEAN,
# MAGIC   created_utc TIMESTAMP
# MAGIC ) USING DELTA


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC CREATE OR REPLACE TABLE gold.dim_fetch_run (
# MAGIC   fetch_run_key BIGINT,
# MAGIC   run_id BIGINT,
# MAGIC   subreddit STRING,
# MAGIC   listing_type STRING,
# MAGIC   time_window STRING,
# MAGIC   limit_requested INT,
# MAGIC   skip_comments BOOLEAN,
# MAGIC   started_at TIMESTAMP,
# MAGIC   finished_at TIMESTAMP,
# MAGIC   posts_ingested INT,
# MAGIC   comments_ingested INT,
# MAGIC   more_calls BIGINT,
# MAGIC   subreddits_seen INT,
# MAGIC   authors_seen INT
# MAGIC ) USING DELTA


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC CREATE OR REPLACE TABLE gold.fct_post (
# MAGIC   post_key BIGINT,
# MAGIC   date_key INT,
# MAGIC   author_key BIGINT,
# MAGIC   subreddit_key BIGINT,
# MAGIC   post_flair_key BIGINT,
# MAGIC   fetch_run_key BIGINT,
# MAGIC   score INT,
# MAGIC   upvote_ratio DOUBLE,
# MAGIC   num_comments INT
# MAGIC ) USING DELTA


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC CREATE OR REPLACE TABLE gold.fct_comment (
# MAGIC   comment_id STRING,
# MAGIC   post_key BIGINT,
# MAGIC   date_key INT,
# MAGIC   author_key BIGINT,
# MAGIC   fetch_run_key BIGINT,
# MAGIC   parent_id STRING,
# MAGIC   body STRING,
# MAGIC   score INT,
# MAGIC   depth INT,
# MAGIC   is_submitter BOOLEAN,
# MAGIC   stickied BOOLEAN,
# MAGIC   created_utc TIMESTAMP,
# MAGIC   edited_utc TIMESTAMP
# MAGIC ) USING DELTA


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC INSERT OVERWRITE TABLE gold.dim_date
# MAGIC WITH source_dates AS (
# MAGIC   SELECT to_date(created_utc) AS full_date FROM dbo.posts WHERE created_utc IS NOT NULL
# MAGIC   UNION
# MAGIC   SELECT to_date(fetched_at) AS full_date FROM dbo.posts WHERE fetched_at IS NOT NULL
# MAGIC   UNION
# MAGIC   SELECT to_date(created_utc) AS full_date FROM dbo.comments WHERE created_utc IS NOT NULL
# MAGIC   UNION
# MAGIC   SELECT to_date(edited_utc) AS full_date FROM dbo.comments WHERE edited_utc IS NOT NULL
# MAGIC   UNION
# MAGIC   SELECT to_date(fetched_at) AS full_date FROM dbo.comments WHERE fetched_at IS NOT NULL
# MAGIC   UNION
# MAGIC   SELECT to_date(started_at) AS full_date FROM dbo.fetch_runs WHERE started_at IS NOT NULL
# MAGIC   UNION
# MAGIC   SELECT to_date(finished_at) AS full_date FROM dbo.fetch_runs WHERE finished_at IS NOT NULL
# MAGIC ), typed_dates AS (
# MAGIC   SELECT CAST(date_format(full_date, 'yyyyMMdd') AS INT) AS date_key,
# MAGIC          CAST(full_date AS DATE) AS full_date,
# MAGIC          CAST(year(full_date) AS INT) AS year,
# MAGIC          CAST(quarter(full_date) AS INT) AS quarter,
# MAGIC          CAST(month(full_date) AS INT) AS month,
# MAGIC          CAST(date_format(full_date, 'MMMM') AS STRING) AS month_name,
# MAGIC          CAST(day(full_date) AS INT) AS day,
# MAGIC          CAST(dayofweek(full_date) AS INT) AS day_of_week,
# MAGIC          CAST(date_format(full_date, 'EEEE') AS STRING) AS day_name,
# MAGIC          CAST(weekofyear(full_date) AS INT) AS week_of_year,
# MAGIC          CAST(CASE WHEN dayofweek(full_date) IN (1, 7) THEN true ELSE false END AS BOOLEAN) AS is_weekend
# MAGIC   FROM source_dates
# MAGIC )
# MAGIC SELECT CAST(-1 AS INT) AS date_key,
# MAGIC        CAST(DATE '1900-01-01' AS DATE) AS full_date,
# MAGIC        CAST(-1 AS INT) AS year,
# MAGIC        CAST(-1 AS INT) AS quarter,
# MAGIC        CAST(-1 AS INT) AS month,
# MAGIC        CAST('Unknown' AS STRING) AS month_name,
# MAGIC        CAST(-1 AS INT) AS day,
# MAGIC        CAST(-1 AS INT) AS day_of_week,
# MAGIC        CAST('Unknown' AS STRING) AS day_name,
# MAGIC        CAST(-1 AS INT) AS week_of_year,
# MAGIC        CAST(false AS BOOLEAN) AS is_weekend
# MAGIC UNION ALL
# MAGIC SELECT date_key, full_date, year, quarter, month, month_name, day, day_of_week, day_name, week_of_year, is_weekend
# MAGIC FROM typed_dates


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC INSERT OVERWRITE TABLE gold.dim_author
# MAGIC WITH author_ids AS (
# MAGIC   SELECT id AS author_id FROM dbo.authors WHERE id IS NOT NULL
# MAGIC   UNION SELECT author_id FROM dbo.posts WHERE author_id IS NOT NULL
# MAGIC   UNION SELECT author_id FROM dbo.comments WHERE author_id IS NOT NULL
# MAGIC ), author_ranked AS (
# MAGIC   SELECT id AS author_id,
# MAGIC          name AS author_name,
# MAGIC          is_deleted,
# MAGIC          fetched_at,
# MAGIC          ROW_NUMBER() OVER (PARTITION BY id ORDER BY fetched_at ASC NULLS LAST, name ASC NULLS LAST) AS rn
# MAGIC   FROM dbo.authors
# MAGIC   WHERE id IS NOT NULL
# MAGIC ), author_agg AS (
# MAGIC   SELECT ids.author_id,
# MAGIC          MAX(CASE WHEN ar.rn = 1 THEN ar.author_name END) AS author_name,
# MAGIC          CAST(MAX(CASE WHEN COALESCE(ar.is_deleted, false) THEN 1 ELSE 0 END) AS BOOLEAN) AS is_deleted,
# MAGIC          MIN(ar.fetched_at) AS first_seen_at,
# MAGIC          MAX(ar.fetched_at) AS last_seen_at
# MAGIC   FROM author_ids ids
# MAGIC   LEFT JOIN author_ranked ar ON ids.author_id = ar.author_id
# MAGIC   GROUP BY ids.author_id
# MAGIC ), employee_ranked AS (
# MAGIC   SELECT lower(username) AS username_lc,
# MAGIC          job_title,
# MAGIC          department,
# MAGIC          ROW_NUMBER() OVER (PARTITION BY lower(username) ORDER BY seed_ingest_time DESC NULLS LAST, username ASC) AS rn
# MAGIC   FROM dbo.microsoft_employees
# MAGIC   WHERE username IS NOT NULL
# MAGIC ), natural_rows AS (
# MAGIC   SELECT CAST(ROW_NUMBER() OVER (ORDER BY a.author_id) AS BIGINT) AS author_key,
# MAGIC          CAST(a.author_id AS STRING) AS author_id,
# MAGIC          CAST(a.author_name AS STRING) AS author_name,
# MAGIC          CAST(COALESCE(a.is_deleted, false) AS BOOLEAN) AS is_deleted,
# MAGIC          CAST(CASE WHEN e.username_lc IS NOT NULL THEN true ELSE false END AS BOOLEAN) AS is_microsoft_employee,
# MAGIC          CAST(e.job_title AS STRING) AS employee_job_title,
# MAGIC          CAST(e.department AS STRING) AS employee_department,
# MAGIC          CAST(a.first_seen_at AS TIMESTAMP) AS first_seen_at,
# MAGIC          CAST(a.last_seen_at AS TIMESTAMP) AS last_seen_at
# MAGIC   FROM author_agg a
# MAGIC   LEFT JOIN employee_ranked e ON lower(a.author_name) = e.username_lc AND e.rn = 1
# MAGIC )
# MAGIC SELECT CAST(-1 AS BIGINT) AS author_key,
# MAGIC        CAST('UNKNOWN' AS STRING) AS author_id,
# MAGIC        CAST('Unknown' AS STRING) AS author_name,
# MAGIC        CAST(false AS BOOLEAN) AS is_deleted,
# MAGIC        CAST(false AS BOOLEAN) AS is_microsoft_employee,
# MAGIC        CAST(NULL AS STRING) AS employee_job_title,
# MAGIC        CAST(NULL AS STRING) AS employee_department,
# MAGIC        CAST(NULL AS TIMESTAMP) AS first_seen_at,
# MAGIC        CAST(NULL AS TIMESTAMP) AS last_seen_at
# MAGIC UNION ALL
# MAGIC SELECT author_key, author_id, author_name, is_deleted, is_microsoft_employee,
# MAGIC        employee_job_title, employee_department, first_seen_at, last_seen_at
# MAGIC FROM natural_rows


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC INSERT OVERWRITE TABLE gold.dim_subreddit
# MAGIC WITH subreddit_ids AS (
# MAGIC   SELECT id AS subreddit_id FROM dbo.subreddits WHERE id IS NOT NULL
# MAGIC   UNION SELECT subreddit_id FROM dbo.posts WHERE subreddit_id IS NOT NULL
# MAGIC ), subreddit_ranked AS (
# MAGIC   SELECT id AS subreddit_id,
# MAGIC          display_name,
# MAGIC          subscribers,
# MAGIC          created_utc,
# MAGIC          fetched_at,
# MAGIC          ROW_NUMBER() OVER (PARTITION BY id ORDER BY fetched_at DESC NULLS LAST, display_name ASC NULLS LAST) AS rn
# MAGIC   FROM dbo.subreddits
# MAGIC   WHERE id IS NOT NULL
# MAGIC ), subreddit_agg AS (
# MAGIC   SELECT ids.subreddit_id,
# MAGIC          MAX(CASE WHEN sr.rn = 1 THEN sr.display_name END) AS display_name,
# MAGIC          MAX(CASE WHEN sr.rn = 1 THEN sr.subscribers END) AS subscribers,
# MAGIC          MIN(sr.created_utc) AS created_utc,
# MAGIC          MIN(sr.fetched_at) AS first_seen_at,
# MAGIC          MAX(sr.fetched_at) AS last_seen_at
# MAGIC   FROM subreddit_ids ids
# MAGIC   LEFT JOIN subreddit_ranked sr ON ids.subreddit_id = sr.subreddit_id
# MAGIC   GROUP BY ids.subreddit_id
# MAGIC ), natural_rows AS (
# MAGIC   SELECT CAST(ROW_NUMBER() OVER (ORDER BY subreddit_id) AS BIGINT) AS subreddit_key,
# MAGIC          CAST(subreddit_id AS STRING) AS subreddit_id,
# MAGIC          CAST(display_name AS STRING) AS display_name,
# MAGIC          CAST(subscribers AS INT) AS subscribers,
# MAGIC          CAST(created_utc AS TIMESTAMP) AS created_utc,
# MAGIC          CAST(first_seen_at AS TIMESTAMP) AS first_seen_at,
# MAGIC          CAST(last_seen_at AS TIMESTAMP) AS last_seen_at
# MAGIC   FROM subreddit_agg
# MAGIC )
# MAGIC SELECT CAST(-1 AS BIGINT) AS subreddit_key,
# MAGIC        CAST('UNKNOWN' AS STRING) AS subreddit_id,
# MAGIC        CAST('Unknown' AS STRING) AS display_name,
# MAGIC        CAST(NULL AS INT) AS subscribers,
# MAGIC        CAST(NULL AS TIMESTAMP) AS created_utc,
# MAGIC        CAST(NULL AS TIMESTAMP) AS first_seen_at,
# MAGIC        CAST(NULL AS TIMESTAMP) AS last_seen_at
# MAGIC UNION ALL
# MAGIC SELECT subreddit_key, subreddit_id, display_name, subscribers, created_utc, first_seen_at, last_seen_at
# MAGIC FROM natural_rows


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC INSERT OVERWRITE TABLE gold.dim_post_flair
# MAGIC WITH flair_base AS (
# MAGIC   SELECT DISTINCT CAST(flair_text AS STRING) AS flair_text
# MAGIC   FROM dbo.posts
# MAGIC   WHERE flair_text IS NOT NULL
# MAGIC ), natural_rows AS (
# MAGIC   SELECT CAST(ROW_NUMBER() OVER (ORDER BY flair_text) AS BIGINT) AS post_flair_key,
# MAGIC          CAST(flair_text AS STRING) AS flair_text
# MAGIC   FROM flair_base
# MAGIC )
# MAGIC SELECT CAST(-1 AS BIGINT) AS post_flair_key,
# MAGIC        CAST('Unknown' AS STRING) AS flair_text
# MAGIC UNION ALL
# MAGIC SELECT post_flair_key, flair_text
# MAGIC FROM natural_rows


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC INSERT OVERWRITE TABLE gold.dim_post
# MAGIC WITH post_ranked AS (
# MAGIC   SELECT *,
# MAGIC          ROW_NUMBER() OVER (PARTITION BY id ORDER BY fetched_at DESC NULLS LAST, created_utc DESC NULLS LAST, short_id ASC NULLS LAST) AS rn
# MAGIC   FROM dbo.posts
# MAGIC   WHERE id IS NOT NULL
# MAGIC ), natural_rows AS (
# MAGIC   SELECT CAST(ROW_NUMBER() OVER (ORDER BY id) AS BIGINT) AS post_key,
# MAGIC          CAST(id AS STRING) AS post_id,
# MAGIC          CAST(short_id AS STRING) AS short_id,
# MAGIC          CAST(title AS STRING) AS title,
# MAGIC          CAST(selftext AS STRING) AS selftext,
# MAGIC          CAST(url AS STRING) AS url,
# MAGIC          CAST(permalink AS STRING) AS permalink,
# MAGIC          CAST(is_self AS BOOLEAN) AS is_self,
# MAGIC          CAST(over_18 AS BOOLEAN) AS over_18,
# MAGIC          CAST(stickied AS BOOLEAN) AS stickied,
# MAGIC          CAST(locked AS BOOLEAN) AS locked,
# MAGIC          CAST(created_utc AS TIMESTAMP) AS created_utc
# MAGIC   FROM post_ranked
# MAGIC   WHERE rn = 1
# MAGIC )
# MAGIC SELECT CAST(-1 AS BIGINT) AS post_key,
# MAGIC        CAST('UNKNOWN' AS STRING) AS post_id,
# MAGIC        CAST(NULL AS STRING) AS short_id,
# MAGIC        CAST('Unknown' AS STRING) AS title,
# MAGIC        CAST(NULL AS STRING) AS selftext,
# MAGIC        CAST(NULL AS STRING) AS url,
# MAGIC        CAST(NULL AS STRING) AS permalink,
# MAGIC        CAST(NULL AS BOOLEAN) AS is_self,
# MAGIC        CAST(NULL AS BOOLEAN) AS over_18,
# MAGIC        CAST(NULL AS BOOLEAN) AS stickied,
# MAGIC        CAST(NULL AS BOOLEAN) AS locked,
# MAGIC        CAST(NULL AS TIMESTAMP) AS created_utc
# MAGIC UNION ALL
# MAGIC SELECT post_key, post_id, short_id, title, selftext, url, permalink,
# MAGIC        is_self, over_18, stickied, locked, created_utc
# MAGIC FROM natural_rows


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC INSERT OVERWRITE TABLE gold.dim_fetch_run
# MAGIC WITH run_ids AS (
# MAGIC   SELECT run_id FROM dbo.fetch_runs WHERE run_id IS NOT NULL
# MAGIC   UNION SELECT fetch_run_id AS run_id FROM dbo.posts WHERE fetch_run_id IS NOT NULL
# MAGIC   UNION SELECT fetch_run_id AS run_id FROM dbo.comments WHERE fetch_run_id IS NOT NULL
# MAGIC ), run_ranked AS (
# MAGIC   SELECT *, ROW_NUMBER() OVER (PARTITION BY run_id ORDER BY started_at DESC NULLS LAST, finished_at DESC NULLS LAST) AS rn
# MAGIC   FROM dbo.fetch_runs
# MAGIC   WHERE run_id IS NOT NULL
# MAGIC ), run_agg AS (
# MAGIC   SELECT ids.run_id,
# MAGIC          MAX(CASE WHEN rr.rn = 1 THEN rr.subreddit END) AS subreddit,
# MAGIC          MAX(CASE WHEN rr.rn = 1 THEN rr.listing_type END) AS listing_type,
# MAGIC          MAX(CASE WHEN rr.rn = 1 THEN rr.time_window END) AS time_window,
# MAGIC          MAX(CASE WHEN rr.rn = 1 THEN rr.limit_requested END) AS limit_requested,
# MAGIC          CAST(MAX(CASE WHEN rr.rn = 1 AND COALESCE(rr.skip_comments, false) THEN 1 ELSE 0 END) AS BOOLEAN) AS skip_comments,
# MAGIC          MAX(CASE WHEN rr.rn = 1 THEN rr.started_at END) AS started_at,
# MAGIC          MAX(CASE WHEN rr.rn = 1 THEN rr.finished_at END) AS finished_at,
# MAGIC          MAX(CASE WHEN rr.rn = 1 THEN rr.posts_ingested END) AS posts_ingested,
# MAGIC          MAX(CASE WHEN rr.rn = 1 THEN rr.comments_ingested END) AS comments_ingested,
# MAGIC          MAX(CASE WHEN rr.rn = 1 THEN rr.more_calls END) AS more_calls,
# MAGIC          MAX(CASE WHEN rr.rn = 1 THEN rr.subreddits_seen END) AS subreddits_seen,
# MAGIC          MAX(CASE WHEN rr.rn = 1 THEN rr.authors_seen END) AS authors_seen
# MAGIC   FROM run_ids ids
# MAGIC   LEFT JOIN run_ranked rr ON ids.run_id = rr.run_id
# MAGIC   GROUP BY ids.run_id
# MAGIC ), natural_rows AS (
# MAGIC   SELECT CAST(ROW_NUMBER() OVER (ORDER BY run_id) AS BIGINT) AS fetch_run_key,
# MAGIC          CAST(run_id AS BIGINT) AS run_id,
# MAGIC          CAST(subreddit AS STRING) AS subreddit,
# MAGIC          CAST(listing_type AS STRING) AS listing_type,
# MAGIC          CAST(time_window AS STRING) AS time_window,
# MAGIC          CAST(limit_requested AS INT) AS limit_requested,
# MAGIC          CAST(skip_comments AS BOOLEAN) AS skip_comments,
# MAGIC          CAST(started_at AS TIMESTAMP) AS started_at,
# MAGIC          CAST(finished_at AS TIMESTAMP) AS finished_at,
# MAGIC          CAST(posts_ingested AS INT) AS posts_ingested,
# MAGIC          CAST(comments_ingested AS INT) AS comments_ingested,
# MAGIC          CAST(more_calls AS BIGINT) AS more_calls,
# MAGIC          CAST(subreddits_seen AS INT) AS subreddits_seen,
# MAGIC          CAST(authors_seen AS INT) AS authors_seen
# MAGIC   FROM run_agg
# MAGIC )
# MAGIC SELECT CAST(-1 AS BIGINT) AS fetch_run_key,
# MAGIC        CAST(-1 AS BIGINT) AS run_id,
# MAGIC        CAST('Unknown' AS STRING) AS subreddit,
# MAGIC        CAST(NULL AS STRING) AS listing_type,
# MAGIC        CAST(NULL AS STRING) AS time_window,
# MAGIC        CAST(NULL AS INT) AS limit_requested,
# MAGIC        CAST(NULL AS BOOLEAN) AS skip_comments,
# MAGIC        CAST(NULL AS TIMESTAMP) AS started_at,
# MAGIC        CAST(NULL AS TIMESTAMP) AS finished_at,
# MAGIC        CAST(NULL AS INT) AS posts_ingested,
# MAGIC        CAST(NULL AS INT) AS comments_ingested,
# MAGIC        CAST(NULL AS BIGINT) AS more_calls,
# MAGIC        CAST(NULL AS INT) AS subreddits_seen,
# MAGIC        CAST(NULL AS INT) AS authors_seen
# MAGIC UNION ALL
# MAGIC SELECT fetch_run_key, run_id, subreddit, listing_type, time_window, limit_requested, skip_comments,
# MAGIC        started_at, finished_at, posts_ingested, comments_ingested, more_calls, subreddits_seen, authors_seen
# MAGIC FROM natural_rows


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC INSERT OVERWRITE TABLE gold.fct_post
# MAGIC SELECT CAST(COALESCE(dp.post_key, -1) AS BIGINT) AS post_key,
# MAGIC        CAST(COALESCE(dd.date_key, -1) AS INT) AS date_key,
# MAGIC        CAST(COALESCE(da.author_key, -1) AS BIGINT) AS author_key,
# MAGIC        CAST(COALESCE(ds.subreddit_key, -1) AS BIGINT) AS subreddit_key,
# MAGIC        CAST(COALESCE(dpf.post_flair_key, -1) AS BIGINT) AS post_flair_key,
# MAGIC        CAST(COALESCE(dfr.fetch_run_key, -1) AS BIGINT) AS fetch_run_key,
# MAGIC        CAST(p.score AS INT) AS score,
# MAGIC        CAST(p.upvote_ratio AS DOUBLE) AS upvote_ratio,
# MAGIC        CAST(p.num_comments AS INT) AS num_comments
# MAGIC FROM dbo.posts p
# MAGIC LEFT JOIN gold.dim_post dp ON p.id = dp.post_id
# MAGIC LEFT JOIN gold.dim_date dd ON to_date(p.created_utc) = dd.full_date
# MAGIC LEFT JOIN gold.dim_author da ON p.author_id = da.author_id
# MAGIC LEFT JOIN gold.dim_subreddit ds ON p.subreddit_id = ds.subreddit_id
# MAGIC LEFT JOIN gold.dim_post_flair dpf ON p.flair_text = dpf.flair_text
# MAGIC LEFT JOIN gold.dim_fetch_run dfr ON p.fetch_run_id = dfr.run_id


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC INSERT OVERWRITE TABLE gold.fct_comment
# MAGIC SELECT CAST(c.id AS STRING) AS comment_id,
# MAGIC        CAST(COALESCE(dp.post_key, -1) AS BIGINT) AS post_key,
# MAGIC        CAST(COALESCE(dd.date_key, -1) AS INT) AS date_key,
# MAGIC        CAST(COALESCE(da.author_key, -1) AS BIGINT) AS author_key,
# MAGIC        CAST(COALESCE(dfr.fetch_run_key, -1) AS BIGINT) AS fetch_run_key,
# MAGIC        CAST(c.parent_id AS STRING) AS parent_id,
# MAGIC        CAST(c.body AS STRING) AS body,
# MAGIC        CAST(c.score AS INT) AS score,
# MAGIC        CAST(c.depth AS INT) AS depth,
# MAGIC        CAST(c.is_submitter AS BOOLEAN) AS is_submitter,
# MAGIC        CAST(c.stickied AS BOOLEAN) AS stickied,
# MAGIC        CAST(c.created_utc AS TIMESTAMP) AS created_utc,
# MAGIC        CAST(c.edited_utc AS TIMESTAMP) AS edited_utc
# MAGIC FROM dbo.comments c
# MAGIC LEFT JOIN gold.dim_post dp ON c.post_id = dp.post_id
# MAGIC LEFT JOIN gold.dim_date dd ON to_date(c.created_utc) = dd.full_date
# MAGIC LEFT JOIN gold.dim_author da ON c.author_id = da.author_id
# MAGIC LEFT JOIN gold.dim_fetch_run dfr ON c.fetch_run_id = dfr.run_id


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC WITH checks AS (
# MAGIC   SELECT 'posts_source_vs_fact' AS check_name, CAST((SELECT COUNT(*) FROM dbo.posts) AS BIGINT) AS expected_count, CAST((SELECT COUNT(*) FROM gold.fct_post) AS BIGINT) AS actual_count
# MAGIC   UNION ALL SELECT 'comments_source_vs_fact', CAST((SELECT COUNT(*) FROM dbo.comments) AS BIGINT), CAST((SELECT COUNT(*) FROM gold.fct_comment) AS BIGINT)
# MAGIC   UNION ALL SELECT 'unknown_dim_date', CAST(1 AS BIGINT), CAST((SELECT COUNT(*) FROM gold.dim_date WHERE date_key = -1) AS BIGINT)
# MAGIC   UNION ALL SELECT 'unknown_dim_author', CAST(1 AS BIGINT), CAST((SELECT COUNT(*) FROM gold.dim_author WHERE author_key = -1) AS BIGINT)
# MAGIC   UNION ALL SELECT 'unknown_dim_subreddit', CAST(1 AS BIGINT), CAST((SELECT COUNT(*) FROM gold.dim_subreddit WHERE subreddit_key = -1) AS BIGINT)
# MAGIC   UNION ALL SELECT 'unknown_dim_post_flair', CAST(1 AS BIGINT), CAST((SELECT COUNT(*) FROM gold.dim_post_flair WHERE post_flair_key = -1) AS BIGINT)
# MAGIC   UNION ALL SELECT 'unknown_dim_post', CAST(1 AS BIGINT), CAST((SELECT COUNT(*) FROM gold.dim_post WHERE post_key = -1) AS BIGINT)
# MAGIC   UNION ALL SELECT 'unknown_dim_fetch_run', CAST(1 AS BIGINT), CAST((SELECT COUNT(*) FROM gold.dim_fetch_run WHERE fetch_run_key = -1) AS BIGINT)
# MAGIC )
# MAGIC SELECT assert_true(COUNT_IF(expected_count <> actual_count) = 0, 'Final gold validation failed') AS final_validation_passed
# MAGIC FROM checks


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC DROP TABLE IF EXISTS gold._stg_dim_date


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC DROP TABLE IF EXISTS gold._stg_dim_author


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC DROP TABLE IF EXISTS gold._stg_dim_subreddit


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC DROP TABLE IF EXISTS gold._stg_dim_post_flair


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC DROP TABLE IF EXISTS gold._stg_dim_post


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC DROP TABLE IF EXISTS gold._stg_dim_fetch_run


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC DROP TABLE IF EXISTS gold._stg_fct_post


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC DROP TABLE IF EXISTS gold._stg_fct_comment


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }
