---
name: ralph-spark-dbt
description: "Run the spark-dbt regression testing loop. Iteratively install, lint, run, and test dbt projects against a local Spark environment until all models and tests pass."
user-invocable: true
---

# spark-dbt Regression Testing Loop

Iterative development loop to make the `spark-dbt` dbt projects bulletproof against regressions.

---

## CRITICAL: Fix Code First, Never Skip Tests

**NEVER `git add` or `git commit`**, ANY changes you made will be reviewed, committed and pushed by a human.

**When dbt tests fail, they represent REAL data quality or logic issues.** The failures are not noise — something is broken and needs a code fix.

**You MUST follow this order:**

1. **Install** — ensure the Python/dbt environment is set up (Step 1)
2. **Lint** — format all Python files (Step 2)
3. **Run & Test** — execute dbt models and tests for affected projects (Step 3)
4. **Signal completion** — only after ALL phases are green (Step 5)

**NEVER emit `{ "status": "Succeeded" }` if any phase is still failing.** If install fails, stop and fix. If dbt run fails, stop and fix. If dbt test fails, stop and fix. Work through the phases systematically.

---

## The Job

Execute the regression testing loop: analyze diffs → install → lint → run dbt projects → emit completion signal.

---

## Context

- **Project**: `spark-dbt` at `/workspaces/spark-sandbox/projects/spark-dbt`
- **Build system**: Nx with Hatch for Python environment management
- **dbt adapter**: `dbt-fabricspark` (custom wheel)
- **dbt projects**:
  - `dbt-jaffle-shop` — simple fictional e-commerce store (customers, orders, payments)
  - `dbt-adventureworks` — complex Kimball dimensional model (STAR schema)
- **Targets**:
  - `local-local` — Local dbt client + Local Spark server (default, used in CI)
  - `local-fabric` — Local dbt client + Fabric Spark server
  - `fabric-fabric` — Fabric dbt client + Fabric Spark server

---

## Step 0: Analyze Git Diffs

```bash
cd /workspaces/spark-sandbox

# Committed changes vs main
git --no-pager diff main...HEAD -- projects/spark-dbt/

# Uncommitted changes
git --no-pager diff -- projects/spark-dbt/
git --no-pager diff --cached -- projects/spark-dbt/
```

Classify changed files:

| Path pattern                  | Classification | Action Required                        |
| ----------------------------- | -------------- | -------------------------------------- |
| `dbt-jaffle-shop/models/*`    | Model code     | Phases 1-3 (run + test jaffle-shop)    |
| `dbt-jaffle-shop/seeds/*`     | Seed data      | Phases 1-3 (run + test jaffle-shop)    |
| `dbt-jaffle-shop/tests/*`     | Test code      | Phases 1-3 (run + test jaffle-shop)    |
| `dbt-jaffle-shop/macros/*`    | Macros         | Phases 1-3 (run + test jaffle-shop)    |
| `dbt-adventureworks/models/*` | Model code     | Phases 1-3 (run + test adventureworks) |
| `dbt-adventureworks/seeds/*`  | Seed data      | Phases 1-3 (run + test adventureworks) |
| `dbt-adventureworks/tests/*`  | Test code      | Phases 1-3 (run + test adventureworks) |
| `dbt-adventureworks/macros/*` | Macros         | Phases 1-3 (run + test adventureworks) |
| `*.yml` (profiles/project)    | Config         | Phases 1-3 (both projects)             |
| `pyproject.toml`              | Dependencies   | Phase 1 (reinstall)                    |
| `.scripts/*`                  | Tooling        | Phases 1-3                             |

If changes span both dbt projects or shared files (profiles, scripts, pyproject.toml), test both projects.

If NO dbt changes are detected at all (only docs/images), skip to the completion signal with Succeeded.

---

## Step 1: Install Environment cleanly

```bash
cd /workspaces/spark-sandbox
npx nx run-many -t clean --parallel=3
npx nx run spark-dbt:install
```

- This cleans the existing Hatch venv and recreates it with `hatch env create`.
- If it fails, check `pyproject.toml` for dependency issues.
- Do NOT proceed to Step 2 until this is green.

---

## Step 2: Lint

```bash
npx nx run spark-dbt:lint
```

- Runs `black --line-length 2000 .` to format Python files.
- Do NOT proceed to Step 3 until this is green.

---

## Step 3: Run & Test dbt Projects

Each dbt sub-project is its own Nx project with its own `test` target. Use `nx affected` (CI default) or `nx run-many` to run the relevant set in parallel against the `local-local` target:

```bash
# All 3 sub-projects
npx nx run-many -t test --projects=dbt-jaffle-shop,dbt-adventureworks,dbt-dataops

# Only the projects whose files changed since main
npx nx affected -t test
```

This executes the full dbt pipeline for each project: `dbt debug` → `dbt deps` → `dbt seed` (if applicable) → `dbt run` → `dbt test` → `dbt docs generate`.

**Prerequisites**: each per-sub-project `test` target depends on `spark-dbt:init`, which itself depends on `spark-scala:init` (Spark metastore must be running) and `spark-dbt:install`.

### Running a single dbt project

If only one project changed, run it individually to iterate faster:

```bash
# Jaffle Shop only
npx nx run dbt-jaffle-shop:test

# Adventureworks only
npx nx run dbt-adventureworks:test

# Or via the root run target (ad-hoc, bypasses per-sub-project nx caching)
npx nx run spark-dbt:run --PROJECT=dbt-jaffle-shop --TARGET=local-local
npx nx run spark-dbt:run --PROJECT=dbt-adventureworks --TARGET=local-local
```

### Running dbt commands directly

For faster iteration on specific models or tests, activate the Hatch shell:

```bash
cd /workspaces/spark-sandbox/projects/spark-dbt
source .venv/bin/activate
cd dbt-jaffle-shop  # or dbt-adventureworks

export DBT_PROFILES_DIR=$(pwd)

# Run a single model
dbt run --target local-local --select model_name

# Run a single test
dbt test --target local-local --select model_name

# Run only modified models and their downstream dependents
dbt run --target local-local --select state:modified+

# Debug connection issues
dbt debug --target local-local
```

### If dbt run fails

1. **Check the error** — is it a SQL error, connection issue, or schema mismatch?
2. **Fix the model SQL** in the relevant `models/` directory
3. **Re-run just the failing model**: `dbt run --target local-local --select <model_name>`
4. **Once it passes**, re-run the full project to ensure no downstream regressions

### If dbt test fails

1. **Identify the failing test** from the output
2. **Check the test definition** in the model's `.yml` schema file or `tests/` directory
3. **Fix either the model logic or the test expectation**
4. **Re-run just that test**: `dbt test --target local-local --select <model_name>`
5. **Once it passes**, re-run the full test suite

Do NOT proceed to Step 4 until ALL models build and ALL tests pass.

---

## Step 4: Iterate If Errors Persist

If any step above is still failing, go back to the appropriate step. Analyze the new error pattern, make code changes, and repeat. The goal is ALL phases green.

---

## Step 5: Completion Signal

**CRITICAL: You MUST emit exactly one of these JSON objects as the absolute last line of your output.**

If ALL phases passed (install + lint + run + test):

```
{ "status": "Succeeded" }
```

If you were unable to fix all failures after exhausting your approaches:

```
{ "status": "Failed" }
```

**The Ralph loop script parses your final output for this signal.** If neither is found, the loop assumes the task is incomplete and will re-invoke you for another iteration. Always emit a status.
