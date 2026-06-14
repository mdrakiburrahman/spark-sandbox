# spark-dbt — Copilot Instructions

These are the conventions and architecture facts that apply to **every** change inside `projects/spark-dbt/`. Read this once before touching the codebase.

> For repo-wide conventions, see [`/.github/copilot-instructions.md`](../../../.github/copilot-instructions.md) (custom Spark plugins, container image pin, Nx affected rules).
> For invocable workflow / agent-loadable skills, see [`./skills/README.md`](skills/README.md).

---

## 1. Project layout

```
projects/spark-dbt/
├── README.md                     # devbox bootstrap, hatch shell, nx targets
├── pyproject.toml                # hatch venv; pinned dbt-fabricspark==1.9.5 (uv installer)
├── project.json                  # nx targets: clean, install, init, run, package, compile, test
├── .scripts/
│   ├── run-dbt-local.sh          # one-project loop: debug → deps → seed → build → cleanup → docs
│   ├── package-fabric.sh         # packages all dbt projects into a Fabric deploy bundle
│   ├── compile-erd.sh            # ERD compile (dbterd)
│   └── compile_erd.py
├── .venv/                        # hatch-managed; dbt + azure-identity + dbterd + dbt-artifacts-parser
│
├── dbt-jaffle-shop/              # Jaffle Shop demo (smoke test for the toolchain)
├── dbt-adventureworks/           # ★ Canonical Kimball STAR schema demo (dim_* / fct_* / obt_*)
└── dbt-dataops/                  # Delta Lake KPI STAR schema (dim_* / fct_*, includes snapshots)
```

All 3 `dbt-*/` directories are managed by the **single** `spark-dbt` Nx project — there is no per-sub-project `project.json`. Sub-projects are selected via the `--PROJECT=` arg to `npx nx run spark-dbt:run`.

---

## 2. Per-dbt-project layout

Every `dbt-<name>/` follows this canonical Kimball-on-Spark structure:

```
dbt-<name>/
├── dbt_project.yml               # name, profile, on-run-start hook, +materialized + +file_format defaults
├── packages.yml                  # dbt deps (dbt_utils, dbt_date, etc.)
├── package-lock.yml              # pinned dep versions
├── profiles.yml                  # local-local | local-fabric | fabric-fabric targets (see §6)
├── README.md                     # project-specific connectivity + run instructions
│
├── models/
│   ├── staging/
│   │   ├── stg_*.sql             # +materialized: view — source predicates + column renames
│   │   └── _sources.yml          # source() declarations
│   └── marts/                    # ← Kimball star schema lives here
│       ├── dim_*.sql             # +materialized: table, +file_format: delta — conformed dimensions
│       ├── dim_*.yml             # column descriptions + tests
│       ├── fct_*.sql             # +materialized: table, +file_format: delta — fact tables
│       ├── fct_*.yml
│       ├── obt_*.sql             # (optional) one-big-table denormalised view of a fact + its dims
│       └── sources.yml           # may co-live with the marts depending on project
│
├── snapshots/                    # SCD2 — file_format='delta'; only dbt-dataops uses these today
│   └── snap_*.sql
├── seeds/                        # CSV seeds (+schema scoped to a *_seed database via dbt_project.yml)
├── analyses/, tests/, macros/
├── erd/                          # dbterd-generated mermaid ERD (committed)
└── target/                       # dbt artifacts (.gitignored)
```

`on-run-start: "{{ fabricspark__ensure_database_exists(target.schema) }}"` is mandatory at the top of every `dbt_project.yml` — the Hive metastore on `local-local` does not auto-create databases.

---

## 3. Kimball model conventions

### 3.1 Dimensions (`dim_*.sql`)

- `+materialized: table` + `+file_format: delta` are set as project-level defaults in `dbt_project.yml`; **do not** repeat them per-model unless overriding.
- One surrogate key column (`<entity>_key`), typically a hash via `dbt_utils.generate_surrogate_key`. The natural / business key stays as a separate column.
- A `dim_date.sql` exists in both `dbt-adventureworks` and `dbt-dataops` — reuse it; do **not** invent a per-fact date dimension.
- SCD2 history goes through `snapshots/snap_*.sql` (not via macro in the dim model).
- Document **every** column in `dim_*.yml`. Add a `unique` + `not_null` test on the surrogate key. Treat the YAML as the dimension's contract.

### 3.2 Facts (`fct_*.sql`)

- Grain is **THE** thing — state it in the model header comment AND in the `description:` of `fct_*.yml`. Every PR that modifies a fact must reconfirm the grain.
- Foreign keys are surrogate keys joined back via `ref('dim_*')` in a staging CTE — never join straight from source.
- Measures are additive when possible. Non-additive measures (averages, ratios) get a `description:` note explaining safe aggregation.
- Add a `unique_combination_of_columns` (dbt_utils) test on the grain keys.

### 3.3 One-Big-Tables (`obt_*.sql`)

- Used in `dbt-adventureworks` for Power BI DirectLake / wide-table read patterns.
- Always `ref()` a fact + its conformed dims — **never** rebuild dim logic in the OBT.

### 3.4 Snapshots (`snap_*.sql`) — only in `dbt-dataops`

```sql
{% snapshot snap_delta_table %}
{{
    config(
        target_schema='dbt_dataops_dwh',
        unique_key='delta_table_key',
        strategy='check',
        check_cols=['scd2_hash'],
        file_format='delta'
    )
}}
    SELECT ... FROM {{ ref('stg_...') }}
{% endsnapshot %}
```

- `file_format='delta'` is required.
- Spark snapshots do NOT support `partition_by` via the `dbt-fabricspark` adapter the same way Databricks does — keep snapshots un-partitioned and rely on liquid-clustering at OPTIMIZE time.

### 3.5 Staging (`stg_*.sql`)

- `+materialized: view` (the project-level default for the `staging` folder).
- Push every source predicate (region filters, date windows) here. Marts join clean.
- Rename columns to the canonical model-domain name (e.g. source `CustomerID` → `customer_id`).

### 3.6 Column naming

- `snake_case` everywhere.
- Dimension keys: `<entity>_key` (surrogate) + `<entity>_id` (natural).
- Date keys: `date_key` (integer YYYYMMDD) + `date` (DATE).
- Booleans: `is_<thing>` / `has_<thing>`.

---

## 4. Nx targets

A single `spark-dbt` Nx project drives all 3 dbt sub-projects via `--PROJECT=` and `--TARGET=`:

| Target    | Owns                                                | Notes                                                   |
| --------- | --------------------------------------------------- | ------------------------------------------------------- |
| `clean`   | hatch env teardown + `.cleanpaths` rm               | Refuses to run inside a `hatch shell` (errors out)      |
| `install` | `hatch env create` (depends on `clean`)             | Creates `.venv/` via uv                                 |
| `init`    | depends on `spark-scala:init` + `install`           | One-time devbox bootstrap                               |
| `run`     | `.scripts/run-dbt-local.sh {PROJECT} {TARGET}`      | Default `PROJECT=dbt-jaffle-shop`, `TARGET=local-local` |
| `test`    | runs all 3 sub-projects in parallel via `:run`      | Depends on `init`                                       |
| `package` | `.scripts/package-fabric.sh`                        | Builds a single Fabric deploy bundle                    |
| `compile` | `.scripts/compile-erd.sh`                           | Regenerates `dbt-<name>/erd/*.md` via `dbterd`          |
| `lint`    | `black --line-length 2000 .` (defined at repo root) | No `sqlfluff` here — Python-only lint                   |

```bash
# One-time devbox setup
npx nx run spark-dbt:init --skip-nx-cache --verbose

# Run one project end-to-end (default TARGET=local-local)
npx nx run spark-dbt:run --PROJECT=dbt-adventureworks
npx nx run spark-dbt:run --PROJECT=dbt-adventureworks --TARGET=local-fabric

# Full-refresh (drops & rebuilds incremental + snapshot state)
FULL_REFRESH=1 npx nx run spark-dbt:run --PROJECT=dbt-dataops

# Run all 3 sub-projects in parallel
npx nx run spark-dbt:test

# ERD + Fabric bundle
npx nx run spark-dbt:compile
npx nx run spark-dbt:package
```

`run-dbt-local.sh` invokes: `dbt debug → dbt deps → dbt seed → dbt build --exclude resource_type:seed → cleanup_dbt_tmp_relations (if macro exists) → dbt docs generate`.

---

## 5. Targets explained: `local-local` vs `local-fabric` vs `fabric-fabric`

Defined per-project in `dbt-<name>/profiles.yml` — all use `type: fabricspark` + `method: livy`:

| Target          | dbt client runs | Spark runs                                            | `livy_mode` | session-id file                                                  |
| --------------- | --------------- | ----------------------------------------------------- | ----------- | ---------------------------------------------------------------- |
| `local-local`   | devcontainer    | local Livy (devcontainer, port 8998)                  | `local`     | `projects/spark-dbt/livy-session-id.txt`                         |
| `local-fabric`  | devcontainer    | Fabric Spark pool (Workspace + Lakehouse IDs in YAML) | `fabric`    | `projects/spark-dbt/livy-session-id.txt`                         |
| `fabric-fabric` | Fabric notebook | Fabric Spark pool                                     | `fabric`    | `/tmp/dbt-fabric-bundle/projects/dbt-<name>/livy-session-id.txt` |

The local Livy session is cached across runs via the `session_id_file`. Delete that file to force a fresh session.

Fabric targets require `FABRIC_ENVIRONMENT_ID` env var (each `profiles.yml` defaults it to a hard-coded GUID — override per environment).

---

## 6. Running a single model / selector

`run-dbt-local.sh` is end-to-end and does not expose `--select`. For partial runs, drop into hatch:

```bash
cd projects/spark-dbt
hatch shell
cd dbt-adventureworks
export DBT_PROFILES_DIR=$(pwd)

dbt build --select dim_customer+ --target local-local
dbt test  --select fct_sales      --target local-local
dbt show  --select stg_customer   --limit 10 --target local-local
```

Use the `using-dbt-for-analytics-engineering` skill ([`skills/using-dbt-for-analytics-engineering/skill.md`](skills/using-dbt-for-analytics-engineering/skill.md)) for the full `dbt show` → model → test workflow.

---

## 7. Linting

Lint at this scope is **Python-only** via `black` (intentionally wide at `--line-length 2000` for `compile_erd.py`-style configs). SQL is **not** linted — but `dbt parse` must succeed:

```bash
# Repo-root: lint all Python under projects/spark-dbt/
npx nx run spark-dbt:lint

# Local: validate Jinja+SQL parses cleanly before pushing
cd projects/spark-dbt && hatch shell
cd dbt-adventureworks && DBT_PROFILES_DIR=$(pwd) dbt parse
```

---

## 8. MCP server

The `dbt-mcp` server is wired into `.vscode/mcp.json` at the repo root. It exposes the dbt CLI's 9 tools (compile, run, test, list, show, docs, deps, parse, build) to Copilot, scoped to a dbt project via env vars.

To use it: run `npx nx run spark-dbt:install` once, then click "Start" on the MCP entry in `.vscode/mcp.json` — see [`README.md`](../README.md#-using-mcp) for the screenshot of the 9 available tools.

When the MCP server is available, the `using-dbt-for-analytics-engineering` skill prefers MCP tools over the bare `dbt` CLI.

---

## 9. ERD generation (`dbterd`)

Each `dbt-<name>/erd/` contains a committed Mermaid ERD generated by `dbterd` (from `dbt-artifacts-parser`'s `manifest.json`):

```bash
npx nx run spark-dbt:compile        # regenerates all 3 ERDs
```

Update the ERD whenever you add / remove / rename a `dim_*` or `fct_*`, or change a foreign-key relationship.

---

## 10. Conventions checklist for new dbt code

- [ ] Model lives in the right folder (`staging/` for `stg_*`, `marts/` for `dim_*`/`fct_*`/`obt_*`, `snapshots/` for `snap_*`).
- [ ] `dim_*` / `fct_*` are `+materialized: table` + `+file_format: delta` (inherited from `dbt_project.yml` — don't repeat).
- [ ] Fact grain is documented in both a SQL header comment and the `description:` of the `.yml`.
- [ ] Surrogate keys via `dbt_utils.generate_surrogate_key`; `unique` + `not_null` tests on every surrogate key.
- [ ] Fact grain enforced with `dbt_utils.unique_combination_of_columns`.
- [ ] Every column documented in the colocated `<model>.yml` (no bare model YAMLs).
- [ ] References use `{{ ref() }}` / `{{ source() }}` — never hardcoded `database.table`.
- [ ] CTEs preferred over subqueries; staging predicates pushed to `stg_*`.
- [ ] ERD regenerated (`npx nx run spark-dbt:compile`) if the DAG changed.
- [ ] `dbt parse` succeeds against `local-local`.
- [ ] `dbt build --select <model>+` succeeds against `local-local` before opening a PR.
- [ ] Unit tests added for any model with non-trivial logic — see [`skills/adding-dbt-unit-test/skill.md`](skills/adding-dbt-unit-test/skill.md).

---

## Skills

| Skill                                                                                        | When to load                                                                |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`using-dbt-for-analytics-engineering`](skills/using-dbt-for-analytics-engineering/skill.md) | Building / modifying any model, exploring sources, debugging dbt errors     |
| [`adding-dbt-unit-test`](skills/adding-dbt-unit-test/skill.md)                               | Adding unit tests for a model or doing TDD on a new fact / dim              |
| [`fetching-dbt-docs`](skills/fetching-dbt-docs/skill.md)                                     | Looking up dbt / dbt-fabricspark configs, materializations, snapshots, etc. |
