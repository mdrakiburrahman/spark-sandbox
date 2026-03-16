# Copilot Instructions

## Architecture

This is an **Nx monorepo** for Apache Spark development, targeting **Microsoft Fabric** runtimes. All subprojects live under `projects/` and share standardized Nx targets (`clean`, `init`, `build`, `test`, `lint`, `deploy`).

| Project        | Stack                                        | Purpose                                                            |
| -------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| `spark-scala`  | Scala 2.12 / SBT / Spark 3.5.1 / Delta 3.2.0 | Core ETL framework, custom Spark plugins, demo drivers             |
| `spark-dbt`    | Python / dbt / Hatch                         | dbt transformations for Spark/Fabric (jaffle-shop, adventureworks) |
| `spark-python` | Python / PySpark / Marimo                    | Interactive PySpark notebooks and tooling                          |
| `marquito`     | TypeScript / Next.js 15 / React 18           | Static OpenLineage data lineage visualization website              |
| `fabric`       | Shell / fabric-cicd                          | IaC deployment for Microsoft Fabric workspaces                     |

### spark-scala internals

The Scala project has **3 SBT submodules** with strict dependency order:

1. **commonExecutor** — Classes loaded by Spark executors via reflection (custom Spark plugins). Keep dependencies minimal to avoid classpath conflicts.
2. **common** — Shared traits, utilities, ETL framework, lineage extraction, Delta Log monitoring. Depends on commonExecutor.
3. **sparkDemo** — Concrete driver applications and transformers. Depends on common.

Driver classes extend `App with Logging` and are registered as aliases in `.scripts/run-spark-jobs.sh` (the `JOB_ALIASES` map). To add a new driver, create the class and add its alias entry to that script.

### Key abstractions (spark-scala common)

- **ETL framework**: `DataReader` → `DataTransformer` → `DataLoader` pipeline with SCD, merge/upsert, and generic loader variants.
- **Lineage**: `LineageExtractor[T]` trait with `OpenLineageExtractor` implementation. `toMermaid()` generates diagrams; `buildLocationMap()` resolves file paths to `database.table` names.
- **Delta Log monitoring**: `DeltaLogExtractor` → `DeltaLogKpiEngine` → `DeltaLogVisualization` pipeline for commit-level KPIs.
- **Configuration**: `YamlEnvironmentConfiguration` loads YAML configs; `DemoEnvironmentConfiguration` extends it for demo drivers.
- **Spark plugins**: Driver-side plugins in commonExecutor (UncachingPlugin HTTP server on port 9999, HttpDumperPlugin for OpenLineage event capture, RpcSparkPlugin).

## Build, Test, and Lint

### Scala (spark-scala)

```bash
# Build fat JAR (required before integration tests or spark-submit)
sbt assembly
# — or via Nx:
npx nx run spark-scala:build-jar

# Unit tests with coverage
sbt coverage test coverageReport
# — or via Nx:
npx nx run spark-scala:test-scala

# Run a single test class
sbt "sparkDemo/testOnly me.rakirahman.sparkdemo.etl.OpenLineageIntegrationTest"

# Run a single test by name pattern
sbt "sparkDemo/testOnly *OpenLineageIntegrationTest -- -z \"should have non-empty schema\""

# Lint (scalafmt)
sbt scalafmtAll
# — or via Nx:
npx nx run spark-scala:lint

# Run a specific spark-submit job
npx nx run spark-scala:run -- --job demo-etl
```

### Integration tests (Jest, root level)

```bash
# Container image consistency test
npx nx run spark-devcontainer:test

# Spark-scala integration tests (requires JAR + metastore)
npx nx run spark-scala:test-jest

# Run a single Jest test file
npx jest tests/container-image.test.cjs
```

### Marquito (Next.js)

```bash
npx nx run marquito:build    # Static export
npx nx run marquito:serve    # Dev server on port 3002
npx nx run marquito:test     # Jest tests
npx nx run marquito:lint     # ESLint
```

### dbt

```bash
npx nx run spark-dbt:install  # Set up Hatch venv
# MCP server is configured in .vscode/mcp.json for AI-assisted dbt development
```

### Python

```bash
npx nx run spark-python:install  # Set up Hatch venv
npx nx run spark-python:test     # Pytest
npx nx run spark-python:lint     # Linting
```

## Conventions

- **Commit messages** follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
- **Scala formatting**: scalafmt with `scalafmtOnCompile := true`. Max line width 300. Config in `projects/spark-scala/.scalafmt.conf`.
- **Schema flattening**: When flattening Spark schemas, field names containing dots must be escaped with backticks (e.g., `` `spark.master` ``) to prevent Spark interpreting them as nested struct access.
- **Dependency management**: Packages must align with [Synapse/Fabric runtime versions](https://learn.microsoft.com/en-us/azure/synapse-analytics/spark/apache-spark-35-runtime). Large packages already in the runtime should use `% "test"` or `--conf spark.jars.packages=...` instead of bundling into the uber JAR. See `project/Dependencies.scala` for details.
- **OpenLineage streaming**: Clear checkpoint directories (`rm -rf checkpoints/data_ops_inventory_db/openlineage`) when raw events are appended to already-processed files, since structured streaming won't re-read them.
- **Test framework**: ScalaTest `AnyFunSpec with Matchers` for Scala; Jest for TypeScript/integration tests.
- **CI pipeline**: Self-hosted runners with a custom devcontainer image. The image digest must match across `.devcontainer/devcontainer.json`, `.github/workflows/gci.yaml`, and `.github/workflows/deploy.yaml` — enforced by `tests/container-image.test.cjs`.
- **Infrastructure**: Local Hive metastore runs on SQL Server via Docker Compose (`docker/Compose.sqlserver.metastore.yaml`, port 11434). IMDS relay router simulates Azure authentication in CI.
