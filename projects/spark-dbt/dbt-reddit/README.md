# dbt project: `reddit`

A Kimball STAR schema over the **`reddit_db`** Delta tables produced by the
`demo-reddit-ingestion` Spark driver (snapshot of r/MicrosoftFabric, `top`-of-month
listing). The design spec lives in [`erd/reddit.dbml`](erd/reddit.dbml).

This project mirrors the structure of [`dbt-jaffle-shop`](../dbt-jaffle-shop) and
the Kimball conventions of [`dbt-adventureworks`](../dbt-adventureworks). See
[`../.github/copilot-instructions.md`](../.github/copilot-instructions.md) for the
shared `spark-dbt` conventions.

Every dimension carries an **unknown member** at `<key> = '-1'`; facts resolve
missing / `[deleted]` / null foreign keys to it via `LEFT JOIN … COALESCE(…, '-1')`,
so every referential-integrity (`relationships`) test stays green.

## Data source

The `reddit_db` tables are mounted into the local Hive metastore as
`reddit_db_prod` by `delta-mount` (run automatically by `spark-dbt:init`). If they
are missing, (re)populate them:

```bash
# Scrape a fresh snapshot into reddit_db Delta tables
npx nx run spark-submit:run --job=demo-reddit-ingestion
# Mount them into the metastore as reddit_db_prod
npx nx run spark-submit:run --job=delta-mount
```

## Run it

```bash
# One-time devbox setup (also mounts reddit_db_prod)
npx nx run spark-dbt:init --skip-nx-cache --verbose

# Full pipeline (debug → deps → seed → build → docs) against local Livy
npx nx run dbt-reddit:test                       # TARGET=local-local (default)
npx nx run dbt-reddit:test --TARGET=local-fabric # local client + Fabric Spark

# Partial run from a hatch shell
cd projects/spark-dbt && hatch shell
cd dbt-reddit && export DBT_PROFILES_DIR=$(pwd)
dbt build --select fct_post+ --target local-local
```

## Tests

- **Keys** — `unique` + `not_null` on every surrogate key and both fact PKs.
- **Referential integrity** — `relationships` on every fact foreign key back to
  its dimension (plus the FK keys carried on `dim_post`).
- **Grain** — `dbt_utils.unique_combination_of_columns` on each fact's grain.
- **Non-emptiness** — `has_rows` (generic) on every model.
- **Unknown member** — `has_unknown_member` (generic) on every dimension.
- **Source parity** — `dbt_utils.equal_rowcount` of each fact against its source
  table (holds while a single `fetch_run` exists).
