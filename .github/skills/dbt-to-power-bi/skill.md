---
name: dbt-to-power-bi
description: "End-to-end interactive workflow to ship a Power BI report from a Delta Lake. Studies source data, builds dbt dims/facts, iterates on a matplotlib PBI-style mockup with the user, lays down semantic-model relationships + DAX measures (TMDL), and finally emits PBIR visual JSON so the report renders in Fabric. Skips the Power BI UI almost entirely."
user-invocable: true
---

# dbt → Power BI

End-to-end skill for turning a raw warehouse into a working Power BI report **without ever opening the Power BI UI** (until the final preview).

The workflow has four hand-offs:

```
Delta source  ─►  dbt dims/facts  ─►  matplotlib mockup  ─►  TMDL semantic model + measures  ─►  PBIR visual JSON
   (Bronze)        (Gold)             (blueprint)             (data model)                       (report)
```

---

## CRITICAL: Human-in-the-Loop

This skill is **interactive**. You MUST pause at every 🛑 checkpoint and ask the user before continuing.

- The dbt schema, the questions the report answers, and the visual aesthetic are all subjective design decisions. Do not auto-decide them.
- **NEVER `git add` or `git commit`** — all changes are reviewed and committed by a human.
- After every matplotlib PNG re-render, **open it with `code <path>` and ask for feedback** before iterating.

---

## Reference Outputs

The canonical Kimball-STAR dbt example in this repo is `projects/spark-dbt/dbt-adventureworks/` (`models/marts/{dim_*,fct_*,obt_*}.sql`). The `dbt-dataops/` project shows the same pattern with snapshots and the Delta-KPI grain.

A complete output from this skill produces:

- **dbt project**: `projects/spark-dbt/dbt-<name>/` (staging → optional intermediate → `models/marts/{dim_*,fct_*,obt_*}.sql`, schema tests, FK tests, watermark + lookback)
- **Matplotlib tool**: `projects/spark-dbt/.temp/pbi-tool/` (`report.py`, `style.py`, `explore.py`, `requirements.txt`, `README.md`) — `.temp/` is `.gitignored`
- **PNG blueprints**: `projects/spark-dbt/.temp/report-draft/report-v{1..N}.png` (each iteration is preserved)
- **Semantic model**: `projects/fabric/workspace-automation/<workspace>/<name>.SemanticModel/definition/` (one `.tmdl` per dim/fact, `Report Measures.tmdl`, `relationships.tmdl`)
- **PBIR report**: `projects/fabric/workspace-automation/<workspace>/Reports/<area>/<name>.Report/`

Skill templates you can copy from:

- [`templates/matplotlib_report.py`](templates/matplotlib_report.py) — Power BI-themed matplotlib skeleton with `draw_card` / `panel` helpers
- [`templates/report_measures.tmdl`](templates/report_measures.tmdl) — TMDL `Report Measures` table with hidden dummy column
- [`templates/generate_pbir_visuals.py`](templates/generate_pbir_visuals.py) — PBIR JSON generator for 5 visual archetypes

> ⚠️ This repo does **not** ship a committed PBIR Report you can template-clone from. Before Step 6, you need to either (a) generate one visual in the Fabric UI and commit it to seed the JSON schema, or (b) bring your own known-working PBIR folder and adapt [`templates/generate_pbir_visuals.py`](templates/generate_pbir_visuals.py) to it. See Step 6a for the workaround.

---

## Step 0: Gather Intent

🛑 **ASK the user**:

> 1. What Delta Lake / warehouse should I study? (path to the `.db/` folder)
> 2. What is the report about? (one sentence — the "elevator pitch")
> 3. Roughly what questions should the report answer? (3–6 bullets is fine; we'll refine after I look at the data)

Capture answers verbatim in your plan.

---

## Step 1: Study the Source Data

Use Python + `deltalake` to enumerate tables and sample each one. Run from a **tmp folder** so dependencies don't pollute the repo:

```bash
mkdir -p projects/spark-dbt/.temp/pbi-tool
cd projects/spark-dbt/.temp/pbi-tool
python3 -m venv venv && source venv/bin/activate
pip install deltalake pandas pyarrow
```

```python
from pathlib import Path
from deltalake import DeltaTable
import pandas as pd

WH = Path("<warehouse path>")
for t in sorted(p.name for p in WH.iterdir() if p.is_dir()):
    df = DeltaTable(str(WH / t)).to_pandas()
    print(f"{t}: {len(df):,} rows, cols={list(df.columns)}")
```

For each table you'll touch downstream, also look at:

- Row count, distinct PK count, date range
- Owner / actor / email columns (these become **`dim_owner`**-style dimensions)
- Status / state / category columns (low-cardinality → great for facets)
- Anything time-stamped (becomes the **grain** of a daily fact)

🛑 **Report findings to the user** in 3–5 bullets per source table. Specifically call out:

- Columns that look like good **dimension candidates** (owners, suites, configs, pipelines)
- Columns that look like good **fact measures** (counts, durations, pass/fail flags)
- Columns that look like **interesting bonus dimensions** the user might want a chart for (e.g. `result_state`, `is_repaired`, `pipeline_tier`)

---

## Step 2: Confirm Questions to Answer

Take the user's bullets from Step 0 + your data findings and propose a **menu of questions** the report can answer. Mark each as 📊 chart-type recommendation.

Example:

> 1. Total tests run over time (📊 column chart, date X)
> 2. Top flaky tests (📊 line chart, legend = test name, top-N + Other)
> 3. Tests left broken and never fixed (📊 line chart, date X, `is_repaired = false`)
> 4. Worst tests by MTTR/MTBF (📊 leaderboard table)
> 5. Distinct test suites per day (📊 column chart)
> 6. _Bonus from your data_: failures by **owner** over time (📊 line chart, legend = owner)

🛑 **ASK**: "Which of these should I build? Any to drop or add?"

---

## Step 3: Build the dbt Models

> **Always** stage-then-shape. Never write fact tables directly off Bronze.

### 3a — Staging (`stg_*`)

One staging model per Bronze source. **Cleaning only** — no joins, no aggregations:

- Cast types, normalize empty strings to NULL, lowercase emails, trim whitespace
- Apply **lookback predicate** for partition pruning (push down to source partition column, e.g. `event_year_date`):

```sql
{% set lookback_days = var('lookback_days', 7) %}
...
WHERE event_year_date >= DATE_SUB(CURRENT_DATE(), {{ lookback_days }})
```

- **Dedup** when source has at-least-once delivery — `ROW_NUMBER() OVER (PARTITION BY pk ORDER BY ingest_time DESC) = 1`.

### 3b — Intermediate (`int_*`)

Business logic that produces a denormalized, conformed view. One row per business event:

- `int_suite_canonical.sql` — joins test result + suite + owner; produces the canonical "one row per test run"
- `int_mtbf_failure_events.sql` — uses `LAG()` window functions over canonical view to mark first-failure / repair events
- `int_mttr_summary.sql` — aggregates repair events to mean-time-to-repair per suite

### 3c — Dimensions (`dim_*`)

One row per business key. **Surrogate key** column (`*_key`) for joining, **natural key** (`*_id`) for display. Use `dbt_utils.generate_surrogate_key` rather than `ROW_NUMBER()` so the keys are stable across runs:

```sql
SELECT
    {{ dbt_utils.generate_surrogate_key(['owner_email']) }} AS owner_key,
    owner_email,
    owner_display_name,
    ...
FROM distinct_owners
```

**`dim_date`**: emit a full date spine (one row per calendar day in the range your facts cover). Power BI's time intelligence and "mark as date table" require a contiguous, unique date column. Reuse the existing `dim_date.sql` in `dbt-adventureworks` / `dbt-dataops` rather than reinventing.

**`dim_owner`**: any column ending in `_email`, `_alias`, `_owner`, `_assigned_to` is a candidate. Normalize: lowercase + trim email, fall back to `"(Unassigned)"` when null/empty.

### 3d — Facts (`fct_*`)

Star-schema facts: foreign keys to dims + measures, never display columns. Note the prefix is **`fct_`** in this repo (not `fact_`):

| Fact pattern          | Grain                    | Use for                            |
| --------------------- | ------------------------ | ---------------------------------- |
| `fct_<thing>_daily`   | one row per (key, date)  | Time-series totals (bar/line)      |
| `fct_<thing>_event`   | one row per occurrence   | Histograms, leaderboards           |
| `fct_<thing>_summary` | one row per business key | KPI cards, "current state" tables  |
| `fct_failed_<thing>`  | one row per failure      | "Left broken / never fixed" charts |

Optional `obt_*` (one-big-table) variants exist in `dbt-adventureworks` for Power BI DirectLake / wide-table read patterns — always `ref()` a fact + its conformed dims; never rebuild dim logic.

### 3e — Tests

Add to the colocated `<model>.yml` (or `schema.yml`):

- `unique` + `not_null` on every PK (surrogate key)
- `dbt_utils.unique_combination_of_columns` on the fact grain
- `relationships` test for every FK → matching dim
- Custom test for any business invariant (e.g. `mtbf_days >= 0`)

### 3f — Run

```bash
# Run one sub-project end-to-end (default TARGET=local-local)
npx nx run dbt-<name>:test

# All 3 sub-projects in parallel
npx nx run-many -t test --projects=dbt-jaffle-shop,dbt-adventureworks,dbt-dataops

# Targeted partial-build (drop into hatch first)
cd projects/spark-dbt && hatch shell && cd dbt-<name>
DBT_PROFILES_DIR=$(pwd) dbt build --select dim_owner+ --target local-local
```

🛑 **STOP**: show the user `dbt ls` output and confirm before proceeding.

---

## Step 4: Iterate on the Matplotlib Mockup

This is the **most-feedback-intensive** step. The mockup is throwaway, but the design decisions stick.

### 4a — Scaffold the tool

Use the template at [`templates/matplotlib_report.py`](templates/matplotlib_report.py). It has:

- Power BI color palette (`PBI` dict, `SUITE_PALETTE`)
- `draw_card(fig, x, y, w, h, value, label, accent)` helper for KPI cards
- `panel(ax, title)` helper for chart panels with the standard PBI title style
- A `REPORT_VERSION` env var so each iteration writes `report-v1.png`, `report-v2.png`, ...

### 4b — Pin dependencies

`requirements.txt` (known-good versions — newer matplotlib has rendered fine, but pin):

```
deltalake==1.6.0
matplotlib==3.10.9
numpy==2.2.6
pandas==2.3.3
pyarrow==24.0.0
```

### 4c — Iteration loop

For each version:

```bash
cd projects/spark-dbt/.temp/pbi-tool
source venv/bin/activate
REPORT_VERSION=v1 python report.py
code ../report-draft/report-v1.png
```

🛑 **ASK**: "How does this look? What should I change?" — **before** writing v2.

Typical feedback patterns from the reference run:

| User says                           | Code change                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| "Passed tests overwhelm the chart"  | Drop the "passed" series; chart only failures.                                                 |
| "Make it a line chart, not bar"     | `ax.plot(...)` with `marker="o"` instead of `ax.bar(...)`.                                     |
| "Legend should be the actual tests" | `groupby([date, suite_name]).size()` + one `plot()` per top-N suite.                           |
| "Get rid of acronyms"               | Rename `MTBF` → `Mean Time Between Failures` in labels (also do this in TMDL later).           |
| "Show owners over time"             | Promote `owner_*` to `dim_owner` in dbt, re-run, add an `ax2` panel mirroring the suite chart. |

### 4d — Find bonus columns

After v3-ish, run a one-off "what else is in the source" probe:

```python
for t in source_tables:
    df = DeltaTable(str(WH / t)).to_pandas()
    for c in df.columns:
        nu = df[c].nunique(dropna=True)
        if 2 <= nu <= 30:    # low-cardinality
            print(f"{t}.{c}: {nu} distinct → {list(df[c].dropna().unique()[:5])}")
```

Surface **3 candidate columns** to the user as potential bonus charts. Let them pick. Then promote to dbt and add a panel.

### 4e — Persist the artefacts

When the user says "I'm happy":

1. Write all SQL used to render the panels to `report-draft/<report-name>.sql` (one query per panel, commented).
2. Write `pbi-tool/README.md` with:
   - One-liner per panel
   - Prereqs (Python version, dbt run command)
   - `python3 -m venv venv && pip install -r requirements.txt` setup
   - `REPORT_VERSION=v7 python report.py` render command

🛑 **STOP** — the matplotlib mockup is now the spec for the real Power BI report.

---

## Step 5: Lay Down the Semantic Model

The Power BI semantic model has three artefacts you write **by hand** (TMDL) before generating the report:

### 5a — Table TMDL files

One `.tmdl` file per dbt table, in `<workspace>/<name>.SemanticModel/definition/tables/`. For each table:

- Pick a **Friendly Name** (spelled-out, Title Case, no acronyms, no `dim_`/`fct_` prefix):

  | dbt table              | Friendly name in TMDL                  |
  | ---------------------- | -------------------------------------- |
  | `dim_owner`            | `'Test Owner'`                         |
  | `dim_test_suite`       | `'Test Suite'`                         |
  | `dim_date`             | `Date`                                 |
  | `fct_suite_build`      | `'Suite Build Outcome'`                |
  | `fct_mtbf_summary`     | `'Mean Time Between Failures Summary'` |
  | `fct_mttr_summary`     | `'Mean Time To Repair Summary'`        |
  | `fct_failed_test_case` | `'Failed Test Case'`                   |

- **Mark the date table** by setting `dataCategory: Time` on the date column (`Date[date]`). This unlocks built-in time intelligence and stops Power BI from auto-generating its hidden date tables.
- **Hide surrogate keys** (`*_key` columns): `isHidden`. They're for joins only.
- **Set `summarizeBy: none`** on any string-ish column that you don't want SUMmed.

### 5b — `relationships.tmdl`

For each fact–dim pair, write a 1:many relationship on the surrogate `*_key` columns:

```tmdl
relationship 25153b95-7d6f-78e8-d2d4-39b588b9c976
	fromColumn: 'Suite Build Outcome'.build_key
	toColumn: Build.build_key
```

Default cardinality is **many-to-one** (fact → dim), single direction. That's correct for a star schema. **Do not** enable bi-directional filtering unless you need it; it can cause ambiguity.

Checklist — make sure every fact has a relationship to:

- Date (for time-series)
- Every dim its FKs point to

🛑 **TELL the user**: "Click-ops the first 2–3 relationships in the Fabric UI as a sanity check, commit, then I'll write the remaining ones into `relationships.tmdl` for you."

This is the **safest** way to learn the TMDL schema — let the UI emit one, then template-clone the rest.

### 5c — `Report Measures.tmdl`

All measures go in **one table** named `Report Measures`. Use the template at [`templates/report_measures.tmdl`](templates/report_measures.tmdl).

Why:

- Measures are easy to find (one place, not scattered across facts).
- The hidden dummy `Measures` column + calculated `Row("Column", BLANK())` partition let the table compile with no source.
- Refreshing the database schema won't wipe your measures.

Naming conventions for measures:

- **Title Case**, plain English. No camelCase, no acronyms.
  - ✅ `'Mean Time To Repair (days)'`, `'P95 Duration (seconds)'`, `'Active Broken Tests'`
  - ❌ `mttr_days`, `p95DurMs`, `activeBrokenTests`
- Include units in the name when ambiguous: `(days)`, `(seconds)`, `%`.
- Format strings:
  - Counts: `#,0`
  - Percentages: `0.00%;-0.00%;0.00%`
  - Durations: `#,0.0` + units in the name
- Reference dims/facts by their **friendly name** (the TMDL `table '...'` value), not the dbt name.

Add `ref table 'Report Measures'` to `model.tmdl`.

🛑 **STOP** — ask the user to publish the semantic model in Fabric and confirm the measures appear in the field list before generating visuals.

---

## Step 6: Generate the PBIR Visuals

This step replaces "click-ops in the Power BI UI" with `git add`-able JSON.

### 6a — Pick a template report

PBIR (Power BI Report) is a folder of JSON files. The schema is **template-friendly but undocumented**. Always copy from a known-working report rather than writing JSON from scratch.

⚠️ **This repo does not ship a committed PBIR Report.** Before you can generate visuals, you need a seed template. Two paths:

1. **Generate one in the Fabric UI** (easiest): open Fabric → New Report → save → export the `.Report` folder via Power BI Desktop Developer Mode or Fabric Git integration. Commit it under `projects/fabric/workspace-automation/<workspace>/Reports/<area>/<name>.Report/`.
2. **Bring your own**: any production PBIR folder you have access to will work — copy it into the repo and adapt the generator script to match its `report.json`/`pages.json` schema version.

The generator script (Step 6c) assumes the standard PBIR JSON shape: a `report.json` + `pages.json` at the root, then `pages/<page-id>/page.json` + `pages/<page-id>/visuals/<20-char-hex>/visual.json` per visual. Any seed that follows this shape will work.

### 6b — Visual archetypes

Almost every dashboard reduces to these five:

| Archetype         | `visualType`           | Use for                                      |
| ----------------- | ---------------------- | -------------------------------------------- |
| KPI card          | `card`                 | One big number (`Total Builds`, `Pass Rate`) |
| Line chart        | `lineChart`            | Time series, with or without legend          |
| Column chart      | `clusteredColumnChart` | Bar chart, typically distinct count per day  |
| Leaderboard       | `tableEx`              | Worst-offenders / Top-N tables               |
| Header / subtitle | `textbox`              | Page title strip                             |

⚠️ Visual-type strings are PBI-version-dependent. If `clusteredColumnChart` doesn't render in your Fabric tenant, render as `lineChart`, open the report, and switch via the visual-type dropdown in the UI — the JSON shape is otherwise identical.

### 6c — Use the generator

The script at [`templates/generate_pbir_visuals.py`](templates/generate_pbir_visuals.py) emits the visual.json files for one page. Edit the constants at the top and the `=== Build visuals ===` block at the bottom:

```python
REPORT_DIR = Path("projects/fabric/workspace-automation/<workspace>/Reports/<area>/<name>.Report")
PAGE_ID = "<20-char-hex from pages.json>"
CANVAS_WIDTH = 1600
CANVAS_HEIGHT = 900
MEASURES_TABLE = "Report Measures"
```

It exports five helpers:

- `card_visual(name, x, y, w, h, z, measure_property, title)`
- `textbox_visual(name, x, y, w, h, z, paragraphs)`
- `line_chart_visual(name, x, y, w, h, z, category, y_values, legend, title)`
- `column_chart_visual(name, x, y, w, h, z, category, y_value, title)`
- `table_visual(name, x, y, w, h, z, columns, title)`

Plus two reference builders for query bindings:

- `measure_ref(entity, prop, display, native)` — for measures from `Report Measures`
- `column_ref(entity, prop, native, active)` — for dim columns (set `active=True` on the X-axis date)

Lay out the page with **integer pixel coordinates** that sum to `CANVAS_WIDTH` / `CANVAS_HEIGHT`. The reference layout for a 1600×900 dashboard is:

```
┌──────────────────────────────────────────────────────────────┐
│  Header textbox  (y=5, h=55)                                 │
├──────┬──────┬──────┬─────────────────────────────────────────┤
│ KPI  │ KPI  │ KPI  │ KPI       (y=70, h=100, w=380 each)     │
├──────┴──────┴──────┴──────────┬──────────────────────────────┤
│ Line chart 1  (920×280)        │ Line chart 2  (645×280)     │
├────────────────────────────────┼─────────────────────────────┤
│ Table         (920×410)        │ Line chart 3  (645×200)     │
│                                ├─────────────────────────────┤
│                                │ Column chart  (645×195)     │
└────────────────────────────────┴─────────────────────────────┘
```

### 6d — Run it

```bash
python3 .github/skills/dbt-to-power-bi/templates/generate_pbir_visuals.py
```

Validate the JSON:

```bash
for v in <report>/definition/pages/<page-id>/visuals/*/visual.json; do
  python3 -c "import json; json.load(open('$v'))" && echo ok: $v
done
```

🛑 **STOP** — tell the user to commit + pull in Fabric to verify the visuals render.

### 6e — Gotchas

- **Table name quoting**: friendly names with spaces go in JSON as `"Entity": "Test Suite"` (no special escaping). The `queryRef` uses the same: `"Test Suite.suite_name"`.
- **`active: true`** must be on the X-axis projection of a line/column chart, otherwise the chart can't tell which column is the axis.
- **Schema version per visual type**: card uses `visualContainer/2.3.0`, lineChart uses `2.4.0`. Match what the template uses; the wrong version makes Fabric reject the file.
- **`z` and `tabOrder`**: integers, typically 100-step increments per visual. The generator uses the same value for both.
- **Visual IDs**: 20-char lowercase hex. The directory name **must** equal the `name` field in `visual.json`.
- **Top-N + "Other" rollup** is not expressible in raw PBIR; tell the user to add it via the **Filters pane** in the Fabric UI after the report renders.

---

## Step 7: Final Walk-Through

🛑 **TELL the user** to:

1. Pull the branch in Fabric (`Source control` → `Update`).
2. Open the report — all visuals should be bound to measures, but most will show **"Can't display the visual"** until they refresh once.
3. Click each visual → confirm field bindings → save.
4. (Optional) Tweak axis formats, conditional formatting, slicer wiring in the UI.

If any visual fails to render, the most common causes are:

| Symptom                                    | Fix                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------ |
| Empty visual, no error                     | Missing `active: true` on the X-axis column projection.                        |
| "The field <X> doesn't exist in the model" | TMDL friendly name doesn't match the `Entity` in visual.json.                  |
| Visual loads but shows wrong values        | Missing relationship between the fact and a dim — fix in `relationships.tmdl`. |
| Whole page is grey                         | `page.json` `width` × `height` doesn't match canvas units. Use ≤ 1920×1080.    |

---

## Anti-patterns

- ❌ Editing fact-table TMDL to add measures. Measures go in `Report Measures`.
- ❌ Skipping the matplotlib mockup. The PBIR generator is "cheap to re-run" but the **design decisions** are not — get them right in matplotlib first.
- ❌ Bi-directional relationships by default. Use only when you've confirmed an ambiguity and accepted the perf cost.
- ❌ Writing PBIR JSON from scratch. Always template-clone from a working report.
- ❌ Acronyms (`MTBF`, `MTTR`, `P95`) in user-facing names. Spell them out: `'Mean Time Between Failures (days)'`.
- ❌ Surrogate keys exposed in the field list. `isHidden` on every `*_key`.
- ❌ Source path-dependent absolute paths in dbt models. Always use `{{ ref(...) }}` / `{{ source(...) }}`.

---

## Reference: Full Artefact Tree

A complete output from this skill looks like:

```
projects/spark-dbt/dbt-<name>/
├── models/
│   ├── staging/         stg_*.sql + schema.yml
│   ├── intermediate/    int_*.sql                (optional)
│   └── marts/           dim_*.sql, fct_*.sql, obt_*.sql + schema.yml
│                        (incl. dim_date, dim_owner — reuse from dbt-adventureworks)
└── dbt_project.yml

projects/spark-dbt/.temp/         (gitignored)
├── pbi-tool/
│   ├── report.py        # matplotlib renderer
│   ├── style.py         # PBI theme + helpers
│   ├── explore.py       # scratch data exploration
│   ├── requirements.txt
│   └── README.md
└── report-draft/
    ├── report-v1.png … report-vN.png
    └── <report-name>.sql   # all SQL behind the PNG

projects/fabric/workspace-automation/<workspace>/
├── <model-name>.SemanticModel/definition/
│   ├── model.tmdl
│   ├── relationships.tmdl
│   └── tables/
│       ├── <friendly>.tmdl (one per dim/fct, friendly names, hidden keys)
│       └── Report Measures.tmdl     ← all DAX measures live here
└── Reports/<area>/<report>.Report/definition/
    ├── report.json
    ├── pages.json
    └── pages/<page-id>/
        ├── page.json                # canvas size, displayOption
        └── visuals/<20-char-hex>/
            └── visual.json          # one folder per visual
```

If you can produce this tree, you're done.
