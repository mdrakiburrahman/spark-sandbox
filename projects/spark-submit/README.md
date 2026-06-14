# 🌐 Spark Submit App

Run Spark jobs locally with DAG-based dependency resolution — with a CLI, a UI, and an HTTP server with full test coverage.

The UI's purpose is to make it significantly easier to visualize dependencies and run parallelized local
dev-loops significantly faster.

The [Next.js](https://nextjs.org/) based app lives at [`projects/spark-submit/`](./).

> There's a CLI as well for test automation, but the features in the UI are significantly more sophisticated.

## Quick Start

```bash
# Start the UI (port 3001)
npx nx run spark-submit:run-ui --skip-nx-cache

# List all available jobs
npx nx run spark-submit:run --list

# Show execution plan (dry-run)
npx nx run spark-submit:run --job=openlineage-silver --dry-run=true

# Run a job with full DAG (executes all dependencies first)
npx nx run spark-submit:run --job=openlineage-silver

# Run a single job without dependencies
npx nx run spark-submit:run --job=demo-etl --no-dag

# Run multiple jobs + their full DAGs, fanned out in parallel by level
# (matches what the UI does when you select multiple jobs)
npx nx run spark-submit:run --job=demo-etl,delta-mount,demo-delta-log-monitor

# Run every job in spark-jobs.yaml as one combined DAG
npx nx run spark-submit:run --job=all
```

> Comma-separated `--job=a,b,c` resolves the union of each target's DAG, dedupes
> shared dependencies, and runs each level in parallel — identical to the UI's
> multi-select behaviour. Per-job logs land under the session directory printed
> at the start of the run.

### Job-Alias Migration

The old `projects/spark-scala/.scripts/run-spark-jobs.sh` `JOB_ALIASES` map has been
**fully replaced** by [`config/spark-jobs.yaml`](./config/spark-jobs.yaml). The
alias names are identical (`demo-etl`, `delta-mount`, `openlineage-silver`, …) — just
swap `npx nx run spark-scala:run --JOB=…` for `npx nx run spark-submit:run --job=…`. The new
CLI also tolerates the old upper-case form (`--JOB=…`) so existing muscle memory
keeps working.

## Job-Class Mapping (CI/Agent Automation)

These commands help CI systems and agents map changed driver classes to affected jobs — useful for identifying which spark-submit jobs to run after a code change.

```bash
# Print the full driver class → job name mapping as JSON
npx nx run spark-submit:run --class-map

# Look up which job a specific driver class belongs to
npx nx run spark-submit:run --class-to-job=me.rakirahman.sparkdemo.etl.drivers.silver.openlineage.OpenLineageSilverDriver

# Find all jobs that would be impacted upstream by a change to a driver class
# (i.e. all jobs that transitively depend on the job containing this class)
npx nx run spark-submit:run --upstream=me.rakirahman.sparkdemo.etl.drivers.demos.DemoEtl
```

### Example Output: `--class-to-job`

```json
{
    "driverClass": "me.rakirahman.sparkdemo.etl.drivers.silver.openlineage.OpenLineageSilverDriver",
    "jobName": "openlineage-silver",
    "category": "silver",
    "description": "Streams OpenLineage JSONL files into the data_ops_inventory_db silver table"
}
```

### Example Output: `--upstream`

```json
{
    "sourceClass": "me.rakirahman.sparkdemo.etl.drivers.demos.DemoEtl",
    "sourceJob": "demo-etl",
    "upstreamDependents": ["openlineage-silver"]
}
```

## Configuration

| File                                                 | Purpose                                                              |
| ---------------------------------------------------- | -------------------------------------------------------------------- |
| [`config/spark-jobs.yaml`](./config/spark-jobs.yaml) | Job registry with dependencies, modules, configs, and inline configs |

## DAG-Based Execution

Jobs define their dependencies via `dependsOn`. When you run a job, the DAG resolver:

1. Builds the dependency graph from target job to roots
2. Topologically sorts jobs (dependencies execute first)
3. Executes jobs in order

```yaml
jobs:
    openlineage-silver:
        dependsOn: [demo-etl]
        # ...
    demo-etl:
        # produces the OpenLineage events the silver streaming job consumes
        # ...
```

Running `--job=openlineage-silver` executes `demo-etl` first (which dumps OpenLineage
JSONL files via the `HttpDumperPlugin`), then streams them into the
`data_ops_inventory_db` silver table.

## Job Registry Structure

The file is here: [`projects/spark-submit/config/spark-jobs.yaml`](./config/spark-jobs.yaml).

The `spark-jobs.yaml` file defines:

- **`defaults`** — Base paths for Spark, Ivy, temp directories, plus the sibling `sparkScalaDir` (where JARs / `log4j2.properties` live).
- **`additionalJars`** — Runtime JAR dependencies (OpenLineage, hadoop-azure, hadoop-azure-datalake).
- **`modules`** — JAR modules with glob patterns (currently `spark-demo` from `projects/spark-scala/spark-demo/`).
- **`sparkConfigSets`** — Reusable Spark config groups (`spark-scala-defaults`, `uncacher-rpc-plugins`, `openlineage-http-dumper`).
- **`jobs`** — Job definitions with class, module, args, dependencies, and inline configs.

### Example Job Definition

```yaml
jobs:
    openlineage-silver:
        module: spark-demo
        class: me.rakirahman.sparkdemo.etl.drivers.silver.openlineage.OpenLineageSilverDriver
        category: silver
        description: Streams OpenLineage JSONL files into the data_ops_inventory_db silver table
        dependsOn:
            - demo-etl
        sparkConfigSets:
            - spark-scala-defaults
        args:
            - data_ops_inventory_db
            - '{sparkScalaDir}/.temp/openlineage'
            - '{sparkScalaDir}/.temp/openlineage-archive'
```

> Note, it's completely possible that the `dependsOn` drifts and a dependency is missed. If you find this is the case, update the config.

### Template variables

`spark-jobs.yaml` values (in `defaults`, `sparkConfigSets`, and `args`) resolve the following tokens at runtime:

| Token             | Resolves to                                                            |
| ----------------- | ---------------------------------------------------------------------- |
| `{projectRoot}`   | `projects/spark-submit`                                                |
| `{sparkScalaDir}` | Sibling `projects/spark-scala` (where JARs + `log4j2.properties` live) |
| `{sparkConfDir}`  | `SPARK_CONF_DIR` env exported to spark-submit                          |
| `{sparkHome}`     | `/opt/spark`                                                           |
| `{tempDir}`       | `projects/spark-submit/.temp`                                          |
| `{heapDumpDir}`   | `projects/spark-submit/.temp/dumps`                                    |
| `{logsDir}`       | `projects/spark-submit/.logs`                                          |
| `{ivyDir}`        | `~/.ivy2`                                                              |
| `{home}`          | `$HOME`                                                                |

## SQL Mode

Run Spark SQL queries from the UI, CLI, or `curl`. The metastore schema browser uses a direct SQL Server connection (`host.docker.internal:11434` from spark-scala's `docker/Compose.sqlserver.metastore.yaml`) for instant discovery, while queries run through Livy/Spark.

> **Auto-managed API server** — SQL via the CLI auto-starts a background API server (`api/src/server.ts`) if one isn't already up on `--api-url` (default `http://localhost:4000`), and tears it down on exit. You don't need to run `nx run spark-submit:run-api` separately. Livy must be up (use `nx run spark-submit:query` to start Livy automatically, or `nx run spark-submit:livy-up`).

### CLI

```bash
# Run a SQL query (prints a markdown table); auto-starts Livy + API server
npx nx run spark-submit:query --sql="SHOW DATABASES"

# Query a table
npx nx run spark-submit:query --sql="SELECT * FROM data_ops_inventory_db.silver_openlineage LIMIT 5"

# Point at a different (already-running) API server — skips auto-start
npx nx run spark-submit:query --sql="SHOW TABLES IN default" --api-url=http://myhost:4000

# Multi-line SQL
cat > $HOME/q.sql <<'SQL'
SELECT *
FROM data_ops_inventory_db.silver_openlineage
WHERE eventType = 'COMPLETE'
LIMIT 5
SQL
npx nx run spark-submit:query --sql-file=$HOME/q.sql
```

> The `run` target also accepts `--sql=` / `--sql-file=` and will auto-start the API server, but it does **not** auto-start Livy. Prefer `query` for SQL workflows.

### curl

```bash
# Execute a SQL query (via Livy/Spark)
curl -s -X POST http://localhost:4000/api/sql/query \
  -H 'Content-Type: application/json' \
  -d '{"sql":"SELECT * FROM data_ops_inventory_db.silver_openlineage LIMIT 5"}'

# Get metastore schema tree (direct SQL Server — instant)
curl -s http://localhost:4000/api/sql/metastore

# Get or create a Livy session
curl -s http://localhost:4000/api/sql/session

# Cancel a running statement
curl -s -X DELETE http://localhost:4000/api/sql/query \
  -H 'Content-Type: application/json' \
  -d '{"statementId": 1}'
```

### SQL API Endpoints

| Method   | Path                 | Description                           |
| -------- | -------------------- | ------------------------------------- |
| `GET`    | `/api/sql/metastore` | Full schema tree (direct SQL Server)  |
| `GET`    | `/api/sql/session`   | Get or create Livy session            |
| `POST`   | `/api/sql/query`     | Execute SQL query `{"sql": "..."}`    |
| `DELETE` | `/api/sql/query`     | Cancel statement `{"statementId": n}` |

### Environment Variables

| Variable        | Default                                                          | Description               |
| --------------- | ---------------------------------------------------------------- | ------------------------- |
| `LIVY_URL`      | `http://localhost:8998`                                          | Livy server URL           |
| `METASTORE_URL` | `mssql://sa:Hive%40Pass123@host.docker.internal:11434/metastore` | Hive metastore SQL Server |

## Nx Targets

| Target                                      | Purpose                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `npx nx run spark-submit:install`           | `npm install` at the project root, `api/`, and `ui/`                       |
| `npx nx run spark-submit:build`             | Build the UI for static export (also resolves `install`)                   |
| `npx nx run spark-submit:test`              | Jest — config, parser, DAG resolver, job class mapper, SQL source          |
| `npx nx run spark-submit:lint`              | `prettier --write` over TS / YAML / JSON                                   |
| `npx nx run spark-submit:run --job=<name>`  | Run a job (or `,`-separated set, or `--job=all`) directly via spark-submit |
| `npx nx run spark-submit:query --sql=…`     | Run a Spark SQL query via Livy (auto-starts Livy + API server)             |
| `npx nx run spark-submit:run-ui`            | Launch the UI on port `3001` (depends on `livy-up`)                        |
| `npx nx run spark-submit:run-api`           | Launch the API server on port `4000`                                       |
| `npx nx run spark-submit:livy-up` / `…down` | Start/stop Livy via `projects/spark-scala/.scripts/run-livy.sh`            |
| `npx nx run spark-submit:clean`             | Remove `.logs/`, `node_modules/`, `.next/`, `dist/`                        |

### Debugging (JDWP)

The old `run-spark-jobs.sh` wrapper had a commented-out `SPARK_SUBMIT_OPTS` line for
JDWP. To attach a debugger today, export the env before invoking the CLI — the new
`JobExecutor` inherits the parent process environment:

```bash
SPARK_SUBMIT_OPTS='-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=5005' \
    npx nx run spark-submit:run --job=demo-etl --no-dag
```

Alternatively, add the option to the job's `sparkConfigSets` entry (under
`spark.driver.extraJavaOptions`) for an always-on attach.
