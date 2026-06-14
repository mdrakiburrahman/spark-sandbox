---
name: kimball-dbml
description: "Interactive workflow to design a Kimball STAR-schema dbml file from a directory of local Delta tables and a list of business questions. Profiles the source data with DuckDB, proposes conformed + local dims and fact tables, validates that every business question can be answered on the proposed model, surfaces bonus insights from sample data, and emits a committed authoring-style .dbml as the design spec for a new dbt project. The dbml is the only artefact that lands in git."
user-invocable: true
---

# Kimball-style dbml Designer

Interactive skill to turn raw Delta tables + business questions into a **committed Kimball STAR-schema design spec** (`<dbt-project>/erd/<name>.dbml`).

The dbml is the design contract. **No dbt models are written by this skill** — model authoring happens later via the [`using-dbt-for-analytics-engineering`](../using-dbt-for-analytics-engineering/skill.md) skill, which consumes the dbml as input.

---

## CRITICAL: Human-in-the-Loop

This skill is **interactive**. You MUST pause at every 🛑 checkpoint and confirm before continuing.

- The dim/fact decomposition, naming choices, SCD types, and which bonus questions to include are subjective design decisions. Do **not** auto-decide them.
- **NEVER `git add` or `git commit`** — the user reviews and commits the dbml.
- The companion `tmp/analysis.md` and the `tmp/` venv are **gitignored** by design. Do not promote them out of `tmp/`.

---

## The Job

```
Source Delta tables  ─►  DuckDB profile  ─►  Candidate bus matrix  ─►  Question validation  ─►  Bonus insights  ─►  Final design  ─►  erd/<name>.dbml
        (input)            (tmp/)                (interactive)            (interactive)           (interactive)        (interactive)        (✅ committed)
```

---

## Context

- **Companion guidelines**: [`./KIMBALL_GUIDELINES.md`](./KIMBALL_GUIDELINES.md) — naming, SCD types, fact archetypes, periodic-snapshot additivity rules, dbml conventions (`{{META:*}}` flags, `Ref:` block). **Read this once before Step 3.**
- **Templates** (in [`./templates/`](./templates/)):
  - `analysis_runner.py` — DuckDB-based Delta profiler. Emits `tmp/analysis.md`.
  - `dbml-skeleton.dbml` — boilerplate header + section markers (`// Conformed Dimensions` / `// Local Dimensions` / `// Facts` / `// Bridge` / `// References`).
  - `bus_matrix_template.md` — fact↔dim grid + grain table + role-playing-dim table.
- **Reference design** (read-only inspiration, not in this repo's gitignore):
  - `projects/spark-dbt/.temp/monitoring/projects/analytics/fabric/sql/erd/insights_raw/insights_raw.dbml` — exemplary authoring-style dbml (`{{META:SCD2}}`, schema namespaces, `Ref:` block)
- **In-repo examples**:
  - `projects/spark-dbt/dbt-adventureworks/erd/full_model.dbml` — generated-style dbml (output of `dbterd` from a compiled dbt manifest, not the design spec)
- **Tooling**: DuckDB Python (`pip install duckdb pandas` — local devcontainer has duckdb 1.5+); `INSTALL delta; LOAD delta;` enables `delta_scan('<path>')` over Delta tables.

---

## Step 0: Gather Requirements

🛑 **ASK the user, one at a time:**

> 1. **What dbt project name should I create the dbml under?** (e.g. `dbt-<domain>`) — this becomes the folder under `projects/spark-dbt/`.

> 2. **What is the absolute path to the local Delta-tables root?** (e.g. `/tmp/.mnt/onelake/<source_db>`). I'll look for subdirectories containing a `_delta_log/` folder — each is one source table.

> 3. **What business questions should the model answer?** Paste them as a bullet list. Example:
>    - Which products get the most page views?
>    - Which customer segments have the highest churn rate?
>    - What is the mean time to first response for support tickets?

Capture all three verbatim in your plan.

---

## Step 1: Scaffold the Workspace

Create the project folder skeleton — only `erd/` is committed; `tmp/` is the scratch space:

```bash
PROJECT=projects/spark-dbt/<dbt-project-name>

mkdir -p $PROJECT/erd $PROJECT/tmp

# Gitignore the scratch space (analysis, venv, sample CSVs, etc.)
cat > $PROJECT/.gitignore <<'EOF'
tmp/
EOF
```

Set up an isolated venv under `tmp/` for the duckdb analysis (so its deps don't pollute the repo or the hatch-managed dbt venv):

```bash
cd $PROJECT/tmp
python3 -m venv venv
source venv/bin/activate
pip install duckdb pandas
```

Confirm DuckDB + the Delta extension load cleanly:

```bash
python3 -c "import duckdb; con = duckdb.connect(); con.execute('INSTALL delta'); con.execute('LOAD delta'); print('OK')"
```

🛑 **STOP** if DuckDB or the Delta extension fails to load. Resolve before continuing.

---

## Step 2: Profile the Source Data

Run the analysis script. It enumerates every subdirectory of `--db` that contains a `_delta_log/` folder and writes a Markdown profile (row counts, schemas, null rates, distinct counts, low-cardinality value distributions, FK candidates):

```bash
# From $PROJECT/tmp/, with venv active
python3 ../../.github/skills/kimball-dbml/templates/analysis_runner.py \
    --db <abs-path-from-Step-0> \
    --out analysis.md
```

Open `analysis.md` and read it cover-to-cover. For each source table, note:

- **Row count + grain candidates** — what makes a row unique?
- **Entity-like columns** — names, IDs, emails, references to other tables (these become **dim** candidates)
- **Measure-like columns** — counts, durations, amounts, timestamps (these become **fact** measures or `dim_date` joins)
- **Low-cardinality columns** — status / type / category fields (great for facets and filters)
- **High-cardinality but-not-unique columns** — likely degenerate-dim candidates (e.g. `post_id`)
- **FK candidates** — same column name across tables = probable join

🛑 **Report findings to the user** in 3–5 bullets per source table. Specifically call out:

- Columns that look like **dimension candidates** (people, things, categories, places)
- Columns that look like **fact measures** (counts, durations, amounts, occurrences)
- **Discovered FK relationships** between source tables
- **Anomalies** worth resolving in `stg_*` later (null rates above 50%, suspect data types, etc.)

---

## Step 3: Build the Candidate Bus Matrix

Apply [`KIMBALL_GUIDELINES.md`](./KIMBALL_GUIDELINES.md) (§§ 2-9) to the profile:

1. **Conformed dims** — extract entities reused across multiple source tables (`dim_date`, `dim_user`, `dim_product`, etc.). Use the **unknown-member pattern** (`<entity>_key = -1`).
2. **Local dims** — entities specific to one fact (e.g. `dim_session` is only used by the session-event fact).
3. **Facts** — for each source table that represents an **event** or **state snapshot**:
   - Pick the **archetype** (transaction / periodic snapshot / accumulating snapshot / factless) — see Guidelines §6
   - State the **grain** precisely (e.g. "one row per comment per second", "one row per post per day")
   - List the **measures** and their **additivity** (fully / semi / non)
   - List the **FK dims** (every fact must FK to `dim_date` at minimum)
4. **Bridges** — wherever you have a true many-to-many (e.g. post ↔ tag, user ↔ role), add a `<a>_<b>_bridge`.
5. **Role-playing dims** — wherever the same dim FKs into one fact multiple times (most common: `dim_date` for `created`, `updated`, `deleted` events) — give each FK a descriptive alias (`created_date_key`, `updated_date_key`, …).
6. **SCD type per dim** — see Guidelines §5:
   - Drifting descriptive attributes (segment, status, name) → SCD2 with `row_effective_*` + `is_row_effective`
   - Stable attributes → SCD1
   - Immutable (e.g. `dim_date`) → SCD0

Render the result into a copy of [`templates/bus_matrix_template.md`](./templates/bus_matrix_template.md), filled in for THIS project, and append it to `tmp/analysis.md`.

🛑 **PAUSE** — Present the bus matrix to the user. Ask:

> Here is the proposed dim/fact decomposition. Please confirm or suggest changes to:
>
> 1. The set of dims (conformed vs local) and their SCD types
> 2. The set of facts, their archetypes, and their grains
> 3. The bridge tables
> 4. The role-playing date keys

Do NOT proceed until the user confirms.

---

## Step 4: Validate Against User Questions

For **each** business question from Step 0, draft the SQL that would answer it on the proposed STAR — using DuckDB directly against the source Delta tables for now (the dbt models don't exist yet, but the column lineage is what matters):

```sql
-- Example: "Which products get the most page views in the last 28 days?"
SELECT
    p.product_name,
    COUNT(*) AS pageviews
FROM delta_scan('<source>/page_views') v   -- will become fct_pageview
INNER JOIN delta_scan('<source>/products') p ON v.product_id = p.id  -- will become dim_product
INNER JOIN delta_scan('<source>/dates') d ON v.event_date = d.date   -- will become dim_date
WHERE d.date >= CURRENT_DATE - INTERVAL 28 DAY
GROUP BY p.product_name
ORDER BY pageviews DESC
LIMIT 20;
```

For each question, verify:

- [ ] Every required attribute lands in a dim or as a measure on the right fact
- [ ] The grain of the fact matches the question's grain (don't ask "MTTR" of a daily snapshot)
- [ ] Additivity is correct (don't `SUM` non-additive snapshot counts across time — see Guidelines §6)
- [ ] All FKs in the SQL match the proposed bus matrix

Append each question + its SQL + the result of running it against the source data to `tmp/analysis.md` under a `## Question Validation` section.

🛑 **STOP** if any question CAN'T be answered with the current model. Report the gap:

> ❌ Question "X" needs attribute `Y` which is not present in any proposed dim. Options:
>
> 1. Add `Y` to `dim_Z` (recommended)
> 2. Promote `Y` to a new local dim
> 3. Drop the question

---

## Step 5: Mine Bonus Insights

Now that the dim/fact structure is solid, scan the data for **interesting bonus questions** the user might want — things the model can answer "for free" given the proposed STAR:

- Low-cardinality categorical breakdowns (e.g. `status_type` × time)
- Top-N rankings on a high-cardinality dim (top 10 X by measure)
- Time-series patterns (day-of-week effects, month-over-month growth)
- Outlier / health metrics (null rates, broken FKs)

Run the SQL for each candidate **against the source data** and capture the actual result. Pick the 3-5 most interesting:

```markdown
### Bonus 1: Day-of-week posting pattern

What time of week sees the most activity?

| day_of_week_name | post_count |
| ---------------- | ---------: |
| Monday           |     12,345 |
| Tuesday          |     13,678 |
| …                |          … |

→ Validates that `dim_date` needs `day_of_week_name` (already in the SCD0 spec).
```

Append these to `tmp/analysis.md` under `## Bonus Insights`.

🛑 **ASK the user**:

> Here are 3-5 bonus questions this STAR can answer "for free". Which (if any) would you like to add to the design? They don't change the dims/facts — just adds them to the documented use cases.

---

## Step 6: Final Design Review

Compile the final design summary table (append to `tmp/analysis.md`):

| Table      | Type          | Archetype / SCD | Grain                          | Key columns                      | Questions it answers      |
| ---------- | ------------- | --------------- | ------------------------------ | -------------------------------- | ------------------------- |
| `dim_date` | Conformed dim | SCD0            | One row per calendar date      | `date_key`                       | All time-series questions |
| `dim_<x>`  | Conformed dim | SCD2            | One row per `<x>`              | `<x>_key`, `<x>_natural_id`      | Q1, Q3                    |
| `fct_<y>`  | Fact          | Transaction     | One row per `<y>` per `<unit>` | `<y>_key`, `date_key`, `<x>_key` | Q1, Q2, Q4                |
| …          |               |                 |                                |                                  |                           |

🛑 **PRESENT** the table to the user. Ask:

> This is the final star schema. The next step writes `erd/<name>.dbml` as the committed design spec. Sign off, or call out any final changes.

Do NOT proceed until the user signs off.

---

## Step 7: Emit `erd/<name>.dbml`

Start from [`templates/dbml-skeleton.dbml`](./templates/dbml-skeleton.dbml). Fill in:

1. **Conformed Dimensions** block — one `Table dim_<x> { ... }` per shared dim
2. **Local Dimensions** block — fact-specific dims
3. **Facts** block — one `Table fct_<y> { ... }` per fact, with the **grain in `Note:`**
4. **Bridge Tables** block — if any M:N exists
5. **References** block — one `Ref:` per FK relationship, parent on the left (`dim_x.<key> < fct_y.<key>`)

Apply the conventions from [`KIMBALL_GUIDELINES.md`](./KIMBALL_GUIDELINES.md) §11:

- `Note: 'GRAIN: one row per <X> per <Y>. ...'` on every fact
- `[primary key]` on every surrogate key
- `[note: '{{META:NATURAL_KEY}} ...']` on every business key
- `[note: '{{META:SCD2}}']` on every SCD2 tracked attribute
- `[note: '{{META:ROLE_PLAYED}}']` on every role-playing date key
- `[note: '{{META:DEGENERATE}} ...']` on degenerate-dim columns on facts

Write the result to `<project>/erd/<name>.dbml`. **Do not write anything else under `<project>/`** — the dbt models come from a separate skill later.

---

## Step 8: Validate the dbml

Round-trip parse the dbml with `pydbml` to catch syntax errors:

```bash
cd $PROJECT/tmp
source venv/bin/activate
pip install pydbml
python3 -c "
from pydbml import PyDBML
db = PyDBML.parse_file('../erd/<name>.dbml')
print(f'OK — {len(db.tables)} tables, {len(db.refs)} refs')
for t in db.tables:
    print(f'  - {t.name} ({len(t.columns)} cols)')
"
```

🛑 **STOP** on any parse error and fix.

Then tell the user to preview the ERD:

> Paste the contents of `<project>/erd/<name>.dbml` into <https://dbdiagram.io> to see the rendered ERD. Or, after the dbt models are authored later, `dbterd` will round-trip-generate a `full_model.dbml` from the compiled manifest for comparison.

---

## Step 9: Hand Off

Summarize what was committed vs gitignored, and what the next steps are:

```
<project>/
├── .gitignore             ✅ committed (one line: `tmp/`)
├── erd/
│   └── <name>.dbml        ✅ committed — THE design spec
└── tmp/                   🚫 gitignored
    ├── venv/              (duckdb + pandas + pydbml)
    └── analysis.md        (profile + question SQL + bonus insights)
```

Tell the user:

> The design dbml is at `<project>/erd/<name>.dbml`. The dbt project scaffolding (`dbt_project.yml`, `profiles.yml`, `models/staging/`, `models/marts/`) is a separate task — invoke the `using-dbt-for-analytics-engineering` skill next and point it at this dbml.

---

## Anti-patterns

- ❌ Skipping Step 2 (the DuckDB profile). You cannot model what you haven't measured. Row counts, null rates, and FK overlap are non-negotiable inputs.
- ❌ Writing the dbml **before** the bus matrix is signed off (Step 3). The bus matrix is the design; the dbml is just its serialization.
- ❌ Designing facts before dims. Always identify the entities (dims) first, then the events / states that involve them (facts).
- ❌ Putting descriptive attributes on facts (`customer_name` on `fct_sales`). They belong on `dim_customer`.
- ❌ Joining on natural keys (`f.email = c.email`). Use surrogate keys.
- ❌ `SUM`-ing counts across days on a periodic snapshot fact. See Guidelines §6.
- ❌ Skipping `dim_date`. Every STAR has one.
- ❌ Writing dbml from scratch — always start from [`templates/dbml-skeleton.dbml`](./templates/dbml-skeleton.dbml).
- ❌ Committing anything under `tmp/`. Only `erd/<name>.dbml` and `.gitignore` are committed.
- ❌ Scaffolding `dbt_project.yml`, `models/`, etc. — that's NOT this skill's job. Hand off to `using-dbt-for-analytics-engineering`.
