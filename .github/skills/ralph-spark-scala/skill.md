---
name: ralph-spark-scala
description: "Run the spark-scala regression testing loop. Iteratively compile, build, test, and validate Spark Drivers against a local VSCode Devcontainer environment until all tests are green."
user-invocable: true
---

# spark-scala Regression Testing Loop

Iterative development loop to make the `spark-scala` Scala/Spark codebase bulletproof against regressions.

---

## CRITICAL: Fix Code First, Never Skip Tests

**NEVER `git add` or `git commit`**, ANY changes you made will be reviewed, committed and pushed by a human.

**When tests fail, they represent REAL regressions caused by a genuine code or logic bug.** The failures are not noise — something is broken and needs a code fix.

**You MUST follow this order:**

1. **Compile** — ensure the codebase compiles cleanly (Step 1)
2. **Build** — produce a fat JAR with `sbt assembly` (Step 2)
3. **Test** — run the full test suite and fix every failure (Step 3)
4. **Spark-submit** — if driver/loader/transformer code changed, validate the affected jobs against a real environment (Step 4)
5. **Signal completion** — only after ALL phases are green (Step 6)

**NEVER emit `{ "status": "Succeeded" }` if any phase is still failing.** If compile fails, stop and fix. If tests fail, stop and fix. If spark-submit fails, stop and fix. Work through the phases systematically.

---

## The Job

Execute the regression testing loop: analyze diffs → compile → build → test → (if driver/loader/transformer changes exist) run spark-submit DAG → emit completion signal.

---

## Context

- **Project**: `spark-scala` at `/workspaces/spark-sandbox/projects/spark-scala`
- **Build system**: Nx with sbt for Scala compilation
- **Test framework**: sbt test with forked JVMs (each test class runs in its own JVM for parallelization)
- **Documentation**: `docs/DEBUGGING.md` for Scala debugging and Metals setup, `docs/SQL_LOCAL.md` for Hive Metastore querying

---

## Step 0: Analyze Git Diffs

```bash
cd /workspaces/spark-sandbox

# Committed changes vs main
git --no-pager diff main...HEAD -- projects/spark-scala/

# Uncommitted changes
git --no-pager diff -- projects/spark-scala/
git --no-pager diff --cached -- projects/spark-scala/
```

Classify changed files:

| Path pattern        | Classification   | Action Required                     |
| ------------------- | ---------------- | ----------------------------------- |
| `*/drivers/*`       | Driver code      | Phases 1-4 (including spark-submit) |
| `*/loader/*`        | Loader code      | Phases 1-4 (including spark-submit) |
| `*/transformer/*`   | Transformer code | Phases 1-4 (including spark-submit) |
| `*/common/src/*`    | Shared library   | Phases 1-3 (full test suite)        |
| `*/src/test/*`      | Test code        | Phases 1-3                          |
| `*.yaml`, `*.conf`  | Config           | Phases 1-3, possibly Phase 4        |
| `tools/*`, `docs/*` | Tooling/docs     | Phase 1 only (quick sanity)         |

If NO Scala changes are detected at all (only docs/tooling), skip to the completion signal with Succeeded.

---

## Step 1: Lint and Compile (Rapid — seconds)

```bash
cd /workspaces/spark-sandbox
npx nx run spark-scala:lint
npx nx run spark-scala:compile-scala
```

- If it fails, study the compiler errors, fix the code, and re-run.
- The `compile-scala` target runs `sbt test:compile` and `sbt compile` to verify both main and test code.
- Do NOT proceed to Step 2 until this is green.

---

## Step 2: Build JAR (~1 minute)

```bash
npx nx run spark-scala:build-jar
```

- If it fails, study the assembly errors, fix the code, and re-run.
- The `build-jar` target runs `sbt assembly` to produce fat JARs.
- Do NOT proceed to Step 3 until this is green.

---

## Step 3: Run All Tests (~10 minutes)

```bash
npx nx run spark-scala:test-scala
```

If it fails:

1. **Identify the failing test class** from the output
2. **Run only that test** to iterate fast:
   ```bash
   cd /workspaces/spark-sandbox/projects/spark-scala
   sbt "sparkDemo/testOnly me.rakirahman.sparkdemo.etl.SomeFailingTest"
   ```
3. **Run a specific test case** within a class:
   ```bash
   sbt "sparkDemo/testOnly *.SomeFailingTest -- -z \"test case description\"" | tee test.log
   ```
4. **Fix the code** (either the test or the production code)
5. **Verify the specific test** passes
6. **Re-run the full suite** to ensure no regressions

**Important sbt test patterns:**

- `sbt "sparkDemo/testOnly me.rakirahman.sparkdemo.etl.OpenLineageIntegrationTest"` — run a specific test class
- `sbt "sparkDemo/testOnly *.OpenLineageIntegrationTest -- -z \"should have non-empty schema\""` — filter within a test class
- `sbt "common/testOnly me.rakirahman.deltalog.SomeCommonTest"` — run a test in the common submodule
- Add `-v` flag for verbose stack traces: `sbt "sparkDemo/testOnly *.SomeTest" -v`
- Pipe to `tee test.log` to preserve output for analysis

**Note on sbt submodule prefixes:** Tests live in either `sparkDemo/` or `common/`. Use the appropriate prefix when running `testOnly`.

Do NOT proceed to Step 4 until ALL tests are green.

---

## Step 4: Spark-Submit Validation (Conditional — 30 minutes+)

You are inside of a devcontainer environment right now where you can go ahead and run the spark-submit CLI, a way to declaratively run Spark Jobs in this codebase.

**YOU MUST execute this step if Step 0 detected changes in `drivers/`, `loader/`, or `transformer/` paths.**

If no driver/loader/transformer changes were found, skip to Step 5.

### 4a: Identify affected jobs

Map changed driver classes to their job aliases. The aliases are defined in
[`projects/spark-submit/config/spark-jobs.yaml`](../../../projects/spark-submit/config/spark-jobs.yaml)
under the `jobs:` map. You can also derive the alias programmatically (recommended in
CI) via:

```bash
npx nx run spark-submit:run --class-to-job=<fully.qualified.DriverClass>
```

| Alias                    | Class                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `demo-plugin`            | `me.rakirahman.sparkdemo.etl.drivers.demos.DemoPluginExploration`                      |
| `demo-etl`               | `me.rakirahman.sparkdemo.etl.drivers.demos.DemoEtl`                                    |
| `delta-mount`            | `me.rakirahman.sparkdemo.etl.drivers.general.management.DeltaMountDriver`              |
| `openlineage-silver`     | `me.rakirahman.sparkdemo.etl.drivers.silver.openlineage.OpenLineageSilverDriver`       |
| `demo-lineage`           | `me.rakirahman.sparkdemo.etl.drivers.demos.DemoLineageExtractor`                       |
| `demo-delta-log-monitor` | `me.rakirahman.sparkdemo.etl.drivers.demos.DemoDeltaLogMonitor`                        |
| `maintenance-vacuum`     | `me.rakirahman.sparkdemo.etl.drivers.general.maintenance.MaintenanceDeltaVacuumDriver` |

If shared library code (`common/src/*`) changed, run `all` to validate the full suite.

### 4b: Execute the affected job(s)

```bash
cd /workspaces/spark-sandbox
npx nx run spark-submit:run --JOB=<alias>
```

For example:

```bash
npx nx run spark-submit:run --JOB=demo-etl
```

To run every job in `spark-jobs.yaml` as one combined DAG:

```bash
npx nx run spark-submit:run --JOB=all
```

If the job fails:

1. Diagnose the error (transient vs code bug)
2. For transient/resilience issues with external dependencies, consider extending retry support following the pattern in `projects/spark-scala/common/src/main/scala/me/rakirahman/spark/RetryPolicy.scala`
3. Fix the code
4. Re-run the specific job to verify the fix
5. Once the single job passes, run any dependent jobs to verify the chain

---

## Step 5: Iterate If Errors Persist

If any step above is still failing, go back to the appropriate step. Analyze the new error pattern, make code changes, and repeat. The goal is ALL phases green.

---

## Step 6: Completion Signal

**CRITICAL: You MUST emit exactly one of these JSON objects as the absolute last line of your output.**

If ALL phases passed (compile + build + test + spark-submit if applicable):

```
{ "status": "Succeeded" }
```

If you were unable to fix all failures after exhausting your approaches:

```
{ "status": "Failed" }
```

**The Ralph loop script parses your final output for this signal.** If neither is found, the loop assumes the task is incomplete and will re-invoke you for another iteration. Always emit a status.
