## Dimensional modelling dbt project: `dataops`

A Kimball STAR schema for monitoring Delta Lake table operations. This dbt project transforms raw inventory data — commit history, table snapshots, health KPIs, and OpenLineage events — into a set of fact and dimension tables for analytics.

### What's in this repo?

This project sources data from the `dataops_inventory` schema (populated by the `spark-scala` ETL framework) and models it into a dimensional warehouse in `dbt_dataops_dwh`.

The Entity-Relationship Diagram is available in [`erd/full_model.dbml`](erd/full_model.dbml).

### Environment setup

```bash
az login

export GIT_ROOT=$(git rev-parse --show-toplevel)
cd "${GIT_ROOT}/projects/spark-dbt/dbt-dataops"

export DBT_PROFILES_DIR=$(pwd)
export DBT_DEBUG=false

dbt debug
```

### Running this project

Install deps:

```bash
dbt deps
```

Build the model:

```bash
dbt run
```

Test:

```bash
dbt test
```

Generate and view documentation:

```bash
dbt docs generate
dbt docs serve --port 18081
```
