---
name: adding-dbt-unit-test
description: "Create unit test YAML definitions that mock upstream model inputs and validate expected outputs for dbt models. Use when adding unit tests for a dbt model in projects/spark-dbt/ or practicing TDD on a new dim_* / fct_* before wiring it into the DAG. Includes the dbt-fabricspark Spark data-type caveat."
user-invocable: false
metadata:
  source: https://github.com/dbt-labs/dbt-agent-skills/blob/2e412857db5099d668c303e589b38edd733da3be/skills/dbt/skills/adding-dbt-unit-test/SKILL.md
  upstream-author: dbt-labs
---

# Add a unit test for a dbt model

dbt unit tests validate **SQL transformation logic on static inputs** before the model is materialized. If any unit test fails, the model is not built.

## When to add a unit test

- Complex SQL: regex, date math, window functions, many-`WHEN` `CASE`, non-trivial joins (self-join, multi-join, conditional join).
- You wrote a bug fix and want a regression guard.
- Edge cases not yet present in your production data.
- About to refactor a fact / dim transformation.
- Model is high-criticality (consumed by Power BI / a contract / an exposure).

## When NOT to add one

- Trivial passthrough projections (`SELECT a, b, c FROM ref('x')`).
- Built-in warehouse functions (`min`, `max`, `count`). Test the surrounding logic, not the function.

## Format: Model-Inputs-Outputs

A unit test is a trio:

1. **`model`** — the model under test.
2. **`given`** — mocked inputs per upstream `ref()` / `source()`.
3. **`expect`** — the exact rows the model should produce.

## Minimal example

```yaml
# models/marts/dim_customer.yml
unit_tests:
  - name: test_dim_customer_drops_inactive
    description: "Inactive customers must not appear in dim_customer."
    model: dim_customer
    given:
      - input: ref('stg_customer')
        rows:
          - { customer_id: 1, is_active: true, customer_name: "Alice" }
          - { customer_id: 2, is_active: false, customer_name: "Bob" }
    expect:
      rows:
        - { customer_id: 1, customer_name: "Alice" }
```

Run it:

```bash
cd projects/spark-dbt && hatch shell && cd dbt-adventureworks
export DBT_PROFILES_DIR=$(pwd)

# Recommended — runs unit tests, then materializes, then runs data tests
dbt build --select dim_customer --target local-local

# Or unit tests only
dbt test --select "dim_customer,test_type:unit" --target local-local
```

## Required prerequisite: upstream models must exist

Unit tests need parent models present in the warehouse (the SQL parser introspects them). For a fresh checkout or a renamed upstream:

```bash
# Build upstream schema-only (zero rows, no warehouse spend)
dbt run --select +dim_customer --exclude dim_customer --empty --target local-local
```

⚠️ `--empty` **overwrites** existing tables with zero-row versions. Only use when the upstream is absent or its schema changed. If upstream has data you want to keep, `dbt build` it normally instead.

## Authoring workflow

1. **Pick the model.** Usually the one you just changed or are about to refactor.
2. **Sniff real data** for realistic inputs:
   ```bash
   dbt show --select stg_customer --limit 5 --target local-local
   ```
   Then sanitise — strip any PII before pasting into YAML.
3. **Mock the inputs.** One `input:` per upstream `ref()` / `source()`. Only include columns the model actually uses.
4. **Mock the output.** Only include columns under test.
5. **Run it.** `dbt build --select <model>` and iterate.

## dbt-fabricspark / Spark-specific notes

- `dbt-fabricspark` (this workspace's adapter) follows the **Spark** data-type rules from upstream. Cast explicitly in `given:` rows when the model relies on a specific type — Spark's type inference from YAML is more aggressive than Snowflake / BigQuery.
- Decimal precision: pass decimals as quoted strings (`amount: "12.50"`) to avoid double-precision drift.
- Timestamps: use ISO-8601 strings (`event_ts: "2024-01-01T00:00:00"`) — Spark accepts the `T` separator.
- Use `format: sql` for inputs that depend on an **ephemeral** model — required, not optional.

## Supported / unsupported

- ✅ SQL models, including incremental models (`expect` describes the merged/inserted slice, not the final-state table).
- ✅ Models referencing seeds — if you omit a seed input, dbt uses the CSV directly.
- ❌ Python models, snapshots, sources, seeds-as-target, materialized views, recursive SQL, introspective queries.
- ❌ Cross-project / packaged models — unit tests can only target models in the current dbt project.

## Excluding unit tests from production

Static inputs → static results → no value running in prod. Exclude in your prod entrypoint:

```bash
dbt build --exclude-resource-type unit_test    # or set DBT_EXCLUDE_RESOURCE_TYPES=unit_test
```

`run-dbt-local.sh` does NOT exclude them today (unit tests are cheap on local-local) — that's by design for local dev.

## YAML lookup

- Unit tests live in any `.yml` under `model-paths` (default `models/`) — typically colocated with the model under `models/marts/<model>.yml`.
- Fixture CSV / SQL files live under `test-paths` (default `tests/fixtures/`).
- Include **every** `ref` / `source` from the model as an `input:` to avoid "node not found" compile errors.

---

> **Full upstream version** (with all the warehouse-specific reference docs we don't ship): [`dbt-labs/dbt-agent-skills` → `adding-dbt-unit-test/SKILL.md`](https://github.com/dbt-labs/dbt-agent-skills/blob/2e412857db5099d668c303e589b38edd733da3be/skills/dbt/skills/adding-dbt-unit-test/SKILL.md).
