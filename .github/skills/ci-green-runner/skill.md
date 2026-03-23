---
name: ci-green-runner
description: "Fix a failing CI run end-to-end: download logs, diagnose failures, apply code fixes, run local tests, push, poll CI, and iterate until green."
user-invocable: true
---

# CI Green Runner

End-to-end workflow to take a failing CI run and iterate until the pipeline is green: diagnose → fix → validate → push → poll → repeat.

---

## CRITICAL: Rules of Engagement

**NEVER `git add` or `git commit` until ALL local validation passes.** Make all code changes first, validate with local tests, THEN commit and push as a single atomic unit.

**When fixing CI failures, fix the root cause — never skip or weaken tests.**

**If multiple failures exist, fix ALL of them before pushing.** Don't push partial fixes that will just fail again on a different error.

---

## The Job

1. Collect the PR link and failed CI run link from the user
2. Download the full CI logs and identify every failure
3. Diagnose root causes for each failure
4. Apply code fixes
5. Run local validation (unit tests, builds)
6. Commit, push, and poll CI until green
7. If CI fails again, loop back to step 2

---

## Context

- **Repository**: `/workspaces/spark-sandbox` (Nx monorepo)
- **CI interaction**: `gh` CLI for logs, run status, and polling
- **Regression skills**:
  - `ralph-spark-scala` — Scala/Spark compile → build → test → spark-submit
  - `ralph-spark-dbt` — dbt install → lint → run → test
- **Ralph loop runner**: `npx tsx tools/scripts/ralph.ts <skill.md> -n <iterations>`
- **CI workflow**: GitHub Actions GCI pipeline, polled via `gh run watch`

---

## Step 0: Collect PR and CI Run Links

Use the `ask_user` tool to prompt the user for **two pieces of information**:

### Prompt 1: PR link

> Which PR has the failing CI? Provide the full GitHub URL.
>
> Example: `https://github.com/mdrakiburrahman/spark-sandbox/pull/38`

### Prompt 2: Failed CI run link

> Which CI run failed? Provide the GitHub Actions run or job URL.
>
> Example: `https://github.com/mdrakiburrahman/spark-sandbox/actions/runs/23462909750/job/68268576002?pr=38`

Parse from these URLs:

- **PR**: owner, repo, PR number
- **CI run**: run ID (and optionally job ID)

---

## Step 1: Set Up Local Branch

Ensure you are on the correct branch and up to date:

```bash
gh pr view <number> --json headRefName --jq '.headRefName'
git checkout <headRefName>
git pull origin <headRefName>
```

Confirm working tree is clean:

```bash
git status
```

---

## Step 2: Download and Analyze CI Logs

### 2a: Download failed job logs

```bash
gh run view <run-id> --log-failed > /tmp/ci-failed-log.txt
```

### 2b: Identify all failures

Search the logs systematically for failure signals:

```bash
# Look for test failures, compilation errors, and runtime errors
grep -i -E '(FAIL|✕|✗|FAILED|error|Error|ERROR|Compilation Error)' /tmp/ci-failed-log.txt \
  | grep -v -E '(failureaccess|failed 0|fails on invalid)' \
  | head -60
```

### 2c: Get context around each failure

For each failure found, extract surrounding lines to understand the full error:

```bash
grep -n '<failure_pattern>' /tmp/ci-failed-log.txt
sed -n '<start>,<end>p' /tmp/ci-failed-log.txt
```

### 2d: Classify failures

Categorize each failure:

| Failure Type                  | Example                                        |
| ----------------------------- | ---------------------------------------------- |
| dbt compilation error         | `dbt could not find a macro with the name "X"` |
| Delta/Spark runtime error     | `DELTA_ZORDERING_ON_PARTITION_COLUMN`          |
| Scala test failure            | `Tests: succeeded N, failed M`                 |
| Jest/integration test failure | `✕ test name`                                  |
| Build failure                 | `[error] Compilation failed`                   |
| Python test failure           | `FAILED tests/test_X.py::test_Y`               |

---

## Step 3: Diagnose Root Causes

For each failure, trace it back to the source code:

1. **Read the error message carefully** — what file, line, or resource is involved?
2. **Find the relevant source code** — use `grep`, `glob`, or explore agents to locate the code
3. **Understand why it fails** — is it a config mismatch, missing resource, logic error, or incompatible change?
4. **Determine the fix** — what's the minimal, correct change?

Use explore agents in parallel for independent investigations:

```
task(agent_type="explore", prompt="Investigate <failure description>. Find <relevant code>.")
```

---

## Step 4: Apply Code Fixes

Make all fixes before any commit:

1. **Edit the source files** to address each root cause
2. **Verify the edits are correct** — re-read the changed files
3. **Track which failures each fix addresses**

### Change classification

Classify changes to determine which local validation is needed:

| Path pattern                  | Affected project | Local validation command                                         |
| ----------------------------- | ---------------- | ---------------------------------------------------------------- |
| `projects/spark-scala/**`     | spark-scala      | `cd projects/spark-scala && sbt test`                            |
| `projects/spark-dbt/**`       | spark-dbt        | `npx nx run spark-dbt:run --PROJECT=<proj> --TARGET=local-local` |
| `projects/spark-python/**`    | spark-python     | `npx nx run spark-python:test`                                   |
| `projects/fabric/**`          | fabric           | No local tests available                                         |
| `*.md`, `tools/**`, `docs/**` | none             | No validation needed                                             |

---

## Step 5: Run Local Validation

Based on the change classification, run the appropriate tests.

### If spark-scala changes exist

```bash
cd /workspaces/spark-sandbox/projects/spark-scala

# Run the specific affected test class first (fast feedback)
sbt "<module>/testOnly <TestClassName>"

# Then run full test suite
sbt test
```

### If spark-dbt changes exist

```bash
cd /workspaces/spark-sandbox/projects/spark-dbt
source .venv/bin/activate
cd <dbt-project>
dbt debug --target local-local
dbt deps
dbt build --target local-local
```

### If spark-python changes exist

```bash
cd /workspaces/spark-sandbox
npx nx run spark-python:test
```

**If any local validation fails**, fix the code and re-run. Do NOT proceed until all local tests pass.

---

## Step 6: Commit and Push

### 6a: Commit

```bash
git add -A
git commit -m "fix: <brief description of all fixes>

<bullet list of what was fixed and why>

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### 6b: Push

```bash
git push origin <branch>
```

---

## Step 7: Poll CI Until Green

### 7a: Find the new CI run

```bash
gh run list -L 5 --json databaseId,headBranch,status,conclusion,createdAt \
  | python3 -c "
import json, sys
runs = json.load(sys.stdin)
for r in runs:
    if r['headBranch'] == '<branch>':
        print(f\"ID: {r['databaseId']}  Status: {r['status']}  Conclusion: {r['conclusion']}\")
"
```

### 7b: Watch the run

```bash
gh run watch <run-id> --exit-status
```

This command blocks until the run completes. CI runs typically take 15-25 minutes.

### 7c: If CI fails again — LOOP

If the run fails:

1. Download the new failed logs:
   ```bash
   gh run view <new-run-id> --log-failed > /tmp/ci-failed-log.txt
   ```
2. Diagnose the new failures (go back to Step 2)
3. Apply fixes (Step 4)
4. Run local validation (Step 5)
5. Amend the commit and force-push:
   ```bash
   git add -A
   git commit --amend --no-edit
   git push --force-with-lease origin <branch>
   ```
6. Poll again (Step 7)

**Repeat this loop until CI is green.**

---

## Step 8: Final Verification

Confirm:

- [ ] CI pipeline is green
- [ ] No uncommitted local changes remain
- [ ] All originally identified failures are resolved

```bash
gh run view <run-id> --json status,conclusion --jq '.conclusion'
# Should output "success"

git status
# Should show clean working tree
```

Report the results to the user with a summary of what was fixed.
