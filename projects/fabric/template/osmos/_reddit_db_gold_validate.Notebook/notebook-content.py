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
# MAGIC SELECT 'dim_date' AS table_name, COUNT(*) AS row_count FROM gold.dim_date
# MAGIC UNION ALL SELECT 'dim_author', COUNT(*) FROM gold.dim_author
# MAGIC UNION ALL SELECT 'dim_subreddit', COUNT(*) FROM gold.dim_subreddit
# MAGIC UNION ALL SELECT 'dim_post_flair', COUNT(*) FROM gold.dim_post_flair
# MAGIC UNION ALL SELECT 'dim_post', COUNT(*) FROM gold.dim_post
# MAGIC UNION ALL SELECT 'dim_fetch_run', COUNT(*) FROM gold.dim_fetch_run
# MAGIC UNION ALL SELECT 'fct_post', COUNT(*) FROM gold.fct_post
# MAGIC UNION ALL SELECT 'fct_comment', COUNT(*) FROM gold.fct_comment
# MAGIC ORDER BY table_name


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC WITH ri_checks AS (
# MAGIC   SELECT 'fct_post.post_key -> dim_post' AS check_name, COUNT(*) AS violation_count
# MAGIC   FROM gold.fct_post f LEFT ANTI JOIN gold.dim_post d ON f.post_key = d.post_key
# MAGIC   UNION ALL SELECT 'fct_post.date_key -> dim_date', COUNT(*) FROM gold.fct_post f LEFT ANTI JOIN gold.dim_date d ON f.date_key = d.date_key
# MAGIC   UNION ALL SELECT 'fct_post.author_key -> dim_author', COUNT(*) FROM gold.fct_post f LEFT ANTI JOIN gold.dim_author d ON f.author_key = d.author_key
# MAGIC   UNION ALL SELECT 'fct_post.subreddit_key -> dim_subreddit', COUNT(*) FROM gold.fct_post f LEFT ANTI JOIN gold.dim_subreddit d ON f.subreddit_key = d.subreddit_key
# MAGIC   UNION ALL SELECT 'fct_post.post_flair_key -> dim_post_flair', COUNT(*) FROM gold.fct_post f LEFT ANTI JOIN gold.dim_post_flair d ON f.post_flair_key = d.post_flair_key
# MAGIC   UNION ALL SELECT 'fct_post.fetch_run_key -> dim_fetch_run', COUNT(*) FROM gold.fct_post f LEFT ANTI JOIN gold.dim_fetch_run d ON f.fetch_run_key = d.fetch_run_key
# MAGIC   UNION ALL SELECT 'fct_comment.post_key -> dim_post', COUNT(*) FROM gold.fct_comment f LEFT ANTI JOIN gold.dim_post d ON f.post_key = d.post_key
# MAGIC   UNION ALL SELECT 'fct_comment.date_key -> dim_date', COUNT(*) FROM gold.fct_comment f LEFT ANTI JOIN gold.dim_date d ON f.date_key = d.date_key
# MAGIC   UNION ALL SELECT 'fct_comment.author_key -> dim_author', COUNT(*) FROM gold.fct_comment f LEFT ANTI JOIN gold.dim_author d ON f.author_key = d.author_key
# MAGIC   UNION ALL SELECT 'fct_comment.fetch_run_key -> dim_fetch_run', COUNT(*) FROM gold.fct_comment f LEFT ANTI JOIN gold.dim_fetch_run d ON f.fetch_run_key = d.fetch_run_key
# MAGIC )
# MAGIC SELECT * FROM ri_checks ORDER BY check_name


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC -- Q1: Top posts by engagement (post score + comment count)
# MAGIC SELECT dp.post_id,
# MAGIC        dp.title,
# MAGIC        da.author_name,
# MAGIC        ds.display_name AS subreddit,
# MAGIC        dpf.flair_text,
# MAGIC        dd.full_date,
# MAGIC        fp.score,
# MAGIC        fp.num_comments,
# MAGIC        CAST(fp.score + fp.num_comments AS INT) AS engagement_score
# MAGIC FROM gold.fct_post fp
# MAGIC JOIN gold.dim_post dp ON fp.post_key = dp.post_key
# MAGIC JOIN gold.dim_author da ON fp.author_key = da.author_key
# MAGIC JOIN gold.dim_subreddit ds ON fp.subreddit_key = ds.subreddit_key
# MAGIC JOIN gold.dim_post_flair dpf ON fp.post_flair_key = dpf.post_flair_key
# MAGIC JOIN gold.dim_date dd ON fp.date_key = dd.date_key
# MAGIC ORDER BY engagement_score DESC, fp.score DESC
# MAGIC LIMIT 10


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC -- Q2: Top authors by combined post and comment activity
# MAGIC WITH post_activity AS (
# MAGIC   SELECT author_key, COUNT(*) AS posts, SUM(score) AS post_score, SUM(num_comments) AS comments_received
# MAGIC   FROM gold.fct_post
# MAGIC   GROUP BY author_key
# MAGIC ), comment_activity AS (
# MAGIC   SELECT author_key, COUNT(*) AS comments, SUM(score) AS comment_score
# MAGIC   FROM gold.fct_comment
# MAGIC   GROUP BY author_key
# MAGIC )
# MAGIC SELECT da.author_name,
# MAGIC        da.is_microsoft_employee,
# MAGIC        COALESCE(pa.posts, 0) AS posts,
# MAGIC        COALESCE(ca.comments, 0) AS comments,
# MAGIC        COALESCE(pa.post_score, 0) AS post_score,
# MAGIC        COALESCE(ca.comment_score, 0) AS comment_score,
# MAGIC        COALESCE(pa.comments_received, 0) AS comments_received
# MAGIC FROM gold.dim_author da
# MAGIC LEFT JOIN post_activity pa ON da.author_key = pa.author_key
# MAGIC LEFT JOIN comment_activity ca ON da.author_key = ca.author_key
# MAGIC WHERE da.author_key <> -1
# MAGIC ORDER BY (COALESCE(pa.posts, 0) + COALESCE(ca.comments, 0)) DESC, (COALESCE(pa.post_score, 0) + COALESCE(ca.comment_score, 0)) DESC
# MAGIC LIMIT 10


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC -- Q3: Comment depth distribution and average score
# MAGIC SELECT depth,
# MAGIC        COUNT(*) AS comment_count,
# MAGIC        ROUND(AVG(score), 2) AS avg_comment_score,
# MAGIC        SUM(CASE WHEN is_submitter THEN 1 ELSE 0 END) AS submitter_comments
# MAGIC FROM gold.fct_comment
# MAGIC GROUP BY depth
# MAGIC ORDER BY depth


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# MAGIC %%sql
# MAGIC -- Q4: Daily activity trend
# MAGIC WITH post_daily AS (
# MAGIC   SELECT date_key,
# MAGIC          COUNT(*) AS posts,
# MAGIC          SUM(score) AS total_post_score,
# MAGIC          ROUND(AVG(upvote_ratio), 4) AS avg_upvote_ratio
# MAGIC   FROM gold.fct_post
# MAGIC   GROUP BY date_key
# MAGIC ), comment_daily AS (
# MAGIC   SELECT date_key,
# MAGIC          COUNT(*) AS comments
# MAGIC   FROM gold.fct_comment
# MAGIC   GROUP BY date_key
# MAGIC )
# MAGIC SELECT dd.full_date,
# MAGIC        COALESCE(pd.posts, 0) AS posts,
# MAGIC        COALESCE(cd.comments, 0) AS comments,
# MAGIC        COALESCE(pd.total_post_score, 0) AS total_post_score,
# MAGIC        pd.avg_upvote_ratio
# MAGIC FROM gold.dim_date dd
# MAGIC LEFT JOIN post_daily pd ON dd.date_key = pd.date_key
# MAGIC LEFT JOIN comment_daily cd ON dd.date_key = cd.date_key
# MAGIC WHERE dd.date_key <> -1
# MAGIC ORDER BY dd.full_date


# METADATA ********************

# META {
# META   "language": "sparksql",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

from pyspark.sql import functions as F

print("Running executable STAR-schema validation checks...")
expected_tables = [
    "dim_date", "dim_author", "dim_subreddit", "dim_post_flair",
    "dim_post", "dim_fetch_run", "fct_post", "fct_comment"
]
counts = {table: spark.table(f"gold.{table}").count() for table in expected_tables}
print("Gold table counts:", counts)

source_post_count = spark.table("dbo.posts").count()
source_comment_count = spark.table("dbo.comments").count()
assert counts["fct_post"] == source_post_count, f"fct_post count {counts['fct_post']} != dbo.posts count {source_post_count}"
assert counts["fct_comment"] == source_comment_count, f"fct_comment count {counts['fct_comment']} != dbo.comments count {source_comment_count}"

unknown_checks = {
    "dim_date": ("date_key", -1),
    "dim_author": ("author_key", -1),
    "dim_subreddit": ("subreddit_key", -1),
    "dim_post_flair": ("post_flair_key", -1),
    "dim_post": ("post_key", -1),
    "dim_fetch_run": ("fetch_run_key", -1),
}
for table, (key_col, key_val) in unknown_checks.items():
    actual = spark.table(f"gold.{table}").filter(F.col(key_col) == key_val).count()
    assert actual == 1, f"{table} expected one unknown member at {key_col}=-1, found {actual}"

ri_queries = {
    "fct_post.post_key -> dim_post": "SELECT COUNT(*) AS cnt FROM gold.fct_post f LEFT ANTI JOIN gold.dim_post d ON f.post_key = d.post_key",
    "fct_post.date_key -> dim_date": "SELECT COUNT(*) AS cnt FROM gold.fct_post f LEFT ANTI JOIN gold.dim_date d ON f.date_key = d.date_key",
    "fct_post.author_key -> dim_author": "SELECT COUNT(*) AS cnt FROM gold.fct_post f LEFT ANTI JOIN gold.dim_author d ON f.author_key = d.author_key",
    "fct_post.subreddit_key -> dim_subreddit": "SELECT COUNT(*) AS cnt FROM gold.fct_post f LEFT ANTI JOIN gold.dim_subreddit d ON f.subreddit_key = d.subreddit_key",
    "fct_post.post_flair_key -> dim_post_flair": "SELECT COUNT(*) AS cnt FROM gold.fct_post f LEFT ANTI JOIN gold.dim_post_flair d ON f.post_flair_key = d.post_flair_key",
    "fct_post.fetch_run_key -> dim_fetch_run": "SELECT COUNT(*) AS cnt FROM gold.fct_post f LEFT ANTI JOIN gold.dim_fetch_run d ON f.fetch_run_key = d.fetch_run_key",
    "fct_comment.post_key -> dim_post": "SELECT COUNT(*) AS cnt FROM gold.fct_comment f LEFT ANTI JOIN gold.dim_post d ON f.post_key = d.post_key",
    "fct_comment.date_key -> dim_date": "SELECT COUNT(*) AS cnt FROM gold.fct_comment f LEFT ANTI JOIN gold.dim_date d ON f.date_key = d.date_key",
    "fct_comment.author_key -> dim_author": "SELECT COUNT(*) AS cnt FROM gold.fct_comment f LEFT ANTI JOIN gold.dim_author d ON f.author_key = d.author_key",
    "fct_comment.fetch_run_key -> dim_fetch_run": "SELECT COUNT(*) AS cnt FROM gold.fct_comment f LEFT ANTI JOIN gold.dim_fetch_run d ON f.fetch_run_key = d.fetch_run_key",
}
ri_results = []
for check_name, query in ri_queries.items():
    violations = spark.sql(query).collect()[0]["cnt"]
    ri_results.append((check_name, violations))
    assert violations == 0, f"RI violation: {check_name} has {violations} orphan rows"
print("RI checks passed:")
for check_name, violations in ri_results:
    print(f"  {check_name}: {violations}")


# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# Executable business queries Q1-Q4. SQL display cells above contain the same business questions.
queries = {
    "Q1_top_posts_by_engagement": """
        SELECT dp.post_id, dp.title, da.author_name, ds.display_name AS subreddit,
               dpf.flair_text, dd.full_date, fp.score, fp.num_comments,
               CAST(fp.score + fp.num_comments AS INT) AS engagement_score
        FROM gold.fct_post fp
        JOIN gold.dim_post dp ON fp.post_key = dp.post_key
        JOIN gold.dim_author da ON fp.author_key = da.author_key
        JOIN gold.dim_subreddit ds ON fp.subreddit_key = ds.subreddit_key
        JOIN gold.dim_post_flair dpf ON fp.post_flair_key = dpf.post_flair_key
        JOIN gold.dim_date dd ON fp.date_key = dd.date_key
        ORDER BY engagement_score DESC, fp.score DESC
        LIMIT 10
    """,
    "Q2_top_authors_by_activity": """
        WITH post_activity AS (
          SELECT author_key, COUNT(*) AS posts, SUM(score) AS post_score, SUM(num_comments) AS comments_received
          FROM gold.fct_post GROUP BY author_key
        ), comment_activity AS (
          SELECT author_key, COUNT(*) AS comments, SUM(score) AS comment_score
          FROM gold.fct_comment GROUP BY author_key
        )
        SELECT da.author_name, da.is_microsoft_employee,
               COALESCE(pa.posts, 0) AS posts,
               COALESCE(ca.comments, 0) AS comments,
               COALESCE(pa.post_score, 0) AS post_score,
               COALESCE(ca.comment_score, 0) AS comment_score,
               COALESCE(pa.comments_received, 0) AS comments_received
        FROM gold.dim_author da
        LEFT JOIN post_activity pa ON da.author_key = pa.author_key
        LEFT JOIN comment_activity ca ON da.author_key = ca.author_key
        WHERE da.author_key <> -1
        ORDER BY (COALESCE(pa.posts, 0) + COALESCE(ca.comments, 0)) DESC,
                 (COALESCE(pa.post_score, 0) + COALESCE(ca.comment_score, 0)) DESC
        LIMIT 10
    """,
    "Q3_comment_depth_distribution": """
        SELECT depth, COUNT(*) AS comment_count, ROUND(AVG(score), 2) AS avg_comment_score,
               SUM(CASE WHEN is_submitter THEN 1 ELSE 0 END) AS submitter_comments
        FROM gold.fct_comment
        GROUP BY depth
        ORDER BY depth
    """,
    "Q4_daily_activity_trend": """
        WITH post_daily AS (
          SELECT date_key, COUNT(*) AS posts, SUM(score) AS total_post_score, ROUND(AVG(upvote_ratio), 4) AS avg_upvote_ratio
          FROM gold.fct_post GROUP BY date_key
        ), comment_daily AS (
          SELECT date_key, COUNT(*) AS comments
          FROM gold.fct_comment GROUP BY date_key
        )
        SELECT dd.full_date, COALESCE(pd.posts, 0) AS posts, COALESCE(cd.comments, 0) AS comments,
               COALESCE(pd.total_post_score, 0) AS total_post_score, pd.avg_upvote_ratio
        FROM gold.dim_date dd
        LEFT JOIN post_daily pd ON dd.date_key = pd.date_key
        LEFT JOIN comment_daily cd ON dd.date_key = cd.date_key
        WHERE dd.date_key <> -1
        ORDER BY dd.full_date
    """,
}

for name, query in queries.items():
    print(f"\n{name}")
    df = spark.sql(query)
    assert df.count() > 0, f"{name} returned no rows"
    df.show(10, truncate=80)


# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# Matplotlib dashboard based on the gold STAR schema.
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

trend_pdf = spark.sql("""
    WITH post_daily AS (
      SELECT date_key, COUNT(*) AS posts, SUM(score) AS total_post_score
      FROM gold.fct_post GROUP BY date_key
    ), comment_daily AS (
      SELECT date_key, COUNT(*) AS comments
      FROM gold.fct_comment GROUP BY date_key
    )
    SELECT dd.full_date,
           COALESCE(pd.posts, 0) AS posts,
           COALESCE(cd.comments, 0) AS comments,
           COALESCE(pd.total_post_score, 0) AS total_post_score
    FROM gold.dim_date dd
    LEFT JOIN post_daily pd ON dd.date_key = pd.date_key
    LEFT JOIN comment_daily cd ON dd.date_key = cd.date_key
    WHERE dd.date_key <> -1
    ORDER BY dd.full_date
""").toPandas()

depth_pdf = spark.sql("""
    SELECT depth, COUNT(*) AS comment_count
    FROM gold.fct_comment
    GROUP BY depth
    ORDER BY depth
""").toPandas()

flair_pdf = spark.sql("""
    SELECT dpf.flair_text, COUNT(*) AS posts, SUM(fp.score) AS total_score
    FROM gold.fct_post fp
    JOIN gold.dim_post_flair dpf ON fp.post_flair_key = dpf.post_flair_key
    GROUP BY dpf.flair_text
    ORDER BY posts DESC, total_score DESC
    LIMIT 10
""").toPandas()

fig, axes = plt.subplots(2, 2, figsize=(16, 10))
fig.suptitle("Reddit gold STAR-schema dashboard", fontsize=16)

if not trend_pdf.empty:
    trend_pdf.plot(x="full_date", y=["posts", "comments"], kind="line", marker="o", ax=axes[0, 0])
    axes[0, 0].set_title("Daily posts and comments")
    axes[0, 0].set_xlabel("Date")
    axes[0, 0].set_ylabel("Count")
    axes[0, 0].tick_params(axis="x", rotation=45)

if not depth_pdf.empty:
    depth_pdf.plot(x="depth", y="comment_count", kind="bar", ax=axes[0, 1], legend=False)
    axes[0, 1].set_title("Comment depth distribution")
    axes[0, 1].set_xlabel("Depth")
    axes[0, 1].set_ylabel("Comments")

if not flair_pdf.empty:
    flair_pdf.plot(x="flair_text", y="posts", kind="barh", ax=axes[1, 0], legend=False)
    axes[1, 0].set_title("Top post flairs by post count")
    axes[1, 0].set_xlabel("Posts")
    axes[1, 0].invert_yaxis()

if not trend_pdf.empty:
    trend_pdf.plot(x="full_date", y="total_post_score", kind="area", ax=axes[1, 1], legend=False, alpha=0.5)
    axes[1, 1].set_title("Daily total post score")
    axes[1, 1].set_xlabel("Date")
    axes[1, 1].set_ylabel("Score")
    axes[1, 1].tick_params(axis="x", rotation=45)

plt.tight_layout(rect=[0, 0, 1, 0.96])
try:
    from IPython.display import display
    display(fig)
except Exception:
    plt.show()
print("Dashboard generated successfully")


# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }
