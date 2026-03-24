---
name: pr-review
description: "Address PR review comments end-to-end: study comments, make code changes, run regression loops, push, poll CI, and resolve threads."
user-invocable: true
---

# PR Review Comment Resolution

End-to-end workflow to address PR review comments: study → fix → validate → push → resolve.

---

## CRITICAL: Rules of Engagement

**NEVER `git add` or `git commit` until ALL validation passes.** Make all code changes first, validate with regression loops, THEN commit and push as a single atomic unit.

**Treat every review comment as a mandatory change request.** Do not skip comments or mark them resolved without addressing them.

**When regression tests fail, fix the code — never skip or weaken tests.**

---

## The Job

1. Collect the PR link from the user
2. Fetch and study every review comment
3. Address each comment with code changes
4. Run regression testing loops (spark-scala + spark-dbt) in parallel
5. Commit, push, and poll CI until green
6. Reply to each comment explaining what was done, then resolve the thread

---

## Context

- **Repository**: `/workspaces/spark-sandbox` (Nx monorepo)
- **PR interaction**: `gh` CLI + GitHub REST/GraphQL APIs
- **Regression skills**:
  - `ralph-spark-scala` — Scala/Spark compile → build → test → spark-submit
  - `ralph-spark-dbt` — dbt install → lint → run → test
- **Ralph loop runner**: `npx tsx tools/scripts/ralph.ts <skill.md> -n <iterations>`
- **CI workflow**: GitHub Actions GCI pipeline, polled via `gh run watch`

---

## Step 0: Collect PR Link

Use the `ask_user` tool to ask the user for the GitHub PR URL.

**Example prompt:**

> Which PR should I review? Provide the full GitHub URL.
>
> Example: `https://github.com/mdrakiburrahman/spark-sandbox/pull/38`

Parse the owner, repo, and PR number from the URL.

---

## Step 1: Fetch and Study Review Comments

### 1a: Get PR metadata

```bash
gh pr view <number> --json title,body,state,headRefName,baseRefName,reviews
```

Ensure you are on the correct branch:

```bash
git checkout <headRefName>
git pull origin <headRefName>
```

### 1b: Fetch all review comments

```bash
gh api repos/<owner>/<repo>/pulls/<number>/comments --paginate
```

For each comment, extract:

| Field          | Purpose                                |
| -------------- | -------------------------------------- |
| `id`           | Comment ID for replies                 |
| `path`         | File the comment is on                 |
| `line`         | Line number in the diff                |
| `body`         | The review feedback                    |
| `in_reply_to`  | If set, this is a reply (skip it)      |
| `diff_hunk`    | Code context around the comment        |

Only process top-level comments (where `in_reply_to` is null).

### 1c: Read the referenced files

For each commented file, read the current content to understand the full context before making changes.

---

## Step 2: Address Code Changes

Work through each comment systematically:

1. **Understand the ask** — read the comment body and diff context
2. **Read the file** — understand the surrounding code
3. **Make the change** — edit the file to address the feedback
4. **Verify locally** — quick sanity check (does the file still parse, compile, etc.)

Track progress — log which comments have been addressed.

### Change classification

Classify each change to determine which regression loops are needed:

| Path pattern                      | Affected project |
| --------------------------------- | ---------------- |
| `projects/spark-scala/**`         | spark-scala      |
| `projects/spark-dbt/**`           | spark-dbt        |
| `projects/fabric/**`              | neither (infra)  |
| `docs/**`, `tools/**`, `*.md`     | neither (docs)   |

---

## Step 3: Run Regression Loops (Parallel)

Based on the change classification from Step 2, fire the appropriate Ralph loops **in parallel** as background processes.

### If spark-scala changes exist

```bash
cd /workspaces/spark-sandbox
npx tsx tools/scripts/ralph.ts .github/skills/ralph-spark-scala/skill.md -n 10 &
RALPH_SCALA_PID=$!
```

### If spark-dbt changes exist

```bash
cd /workspaces/spark-sandbox
npx tsx tools/scripts/ralph.ts .github/skills/ralph-spark-dbt/skill.md -n 10 &
RALPH_DBT_PID=$!
```

### Wait for both to complete

```bash
wait $RALPH_SCALA_PID
SCALA_EXIT=$?

wait $RALPH_DBT_PID
DBT_EXIT=$?

echo "spark-scala: exit ${SCALA_EXIT}, spark-dbt: exit ${DBT_EXIT}"
```

**If either Ralph loop fails**, study the output, fix the code, and re-run the failing loop. Do NOT proceed until both are green.

**If only one project was affected**, run only that loop.

**If neither project was affected** (e.g., only infra/docs changes), skip this step.

---

## Step 4: Commit, Push, and Poll CI

### 4a: Commit

```bash
git add -A
git commit -m "fix: address PR #<number> review comments

<brief summary of changes>

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

### 4b: Push

```bash
git push origin <branch>
```

### 4c: Poll CI

Find the workflow run triggered by the push:

```bash
gh run list --limit 5 --json databaseId,headBranch,status,conclusion,createdAt
```

Filter for the current branch, then watch:

```bash
gh run watch <run-id> --exit-status
```

**If CI fails**, study the logs, fix the issue, amend the commit, force-push, and re-poll:

```bash
gh run view --job=<job-id>   # Check which step failed
# ... fix code ...
git add -A && git commit --amend --no-edit
git push --force-with-lease origin <branch>
```

---

## Step 5: Reply and Resolve Comments

### 5a: Reply to each comment

For each top-level comment, post a reply explaining what was done:

```bash
gh api repos/<owner>/<repo>/pulls/<number>/comments \
  -X POST \
  -F body="Done — <brief explanation of the fix>." \
  -F "in_reply_to=<comment_id>"
```

### 5b: Resolve threads

Fetch review thread IDs via GraphQL:

```graphql
query {
  repository(owner: "<owner>", name: "<repo>") {
    pullRequest(number: <number>) {
      reviewThreads(first: 50) {
        nodes {
          id
          isResolved
          comments(first: 1) {
            nodes { databaseId }
          }
        }
      }
    }
  }
}
```

Then resolve each unresolved thread:

```graphql
mutation {
  resolveReviewThread(input: { threadId: "<thread_node_id>" }) {
    thread { isResolved }
  }
}
```

Use `gh api graphql` for both queries.

---

## Step 6: Final Verification

Confirm:

- [ ] All review comments replied to
- [ ] All review threads resolved
- [ ] CI pipeline green
- [ ] No uncommitted changes remain

```bash
gh api repos/<owner>/<repo>/pulls/<number>/comments --paginate \
  | python3 -c "
import json, sys
comments = json.load(sys.stdin)
top_level = [c for c in comments if not c.get('in_reply_to_id')]
print(f'Total comments: {len(top_level)}')
"

gh api graphql -f query='
query {
  repository(owner: "<owner>", name: "<repo>") {
    pullRequest(number: <number>) {
      reviewThreads(first: 50) {
        nodes { isResolved }
      }
    }
  }
}' --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved == false)] | length'
# Should output 0
```
