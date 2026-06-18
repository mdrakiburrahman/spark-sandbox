## Dimensional modelling dbt project: `dataops`

In the `dbt_dataops_dwh` warehouse:

1. **Delta Lake operations star** (`*_delta_*`) — monitors Delta table operations:
   commit history, table snapshots, health KPIs, and OpenLineage lineage.

2. **dbt observability star** (`*_dbt_*`) — turns the project's own execution
   telemetry (`dbt_node_executions`, emitted by `dbt-runner-lib` on every local and
   Fabric run) into analytics-ready facts, dimensions, and fully-denormalised OBTs.

Both source from the `dataops_inventory` schema (populated by the `spark-scala` ETL
framework and the dbt runner) and model into `dbt_dataops_dwh`.

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
