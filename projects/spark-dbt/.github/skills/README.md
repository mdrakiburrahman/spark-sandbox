# spark-dbt Skills 🛠️

Copilot / agent skills scoped to the `projects/spark-dbt/` workspace. Each skill is a folder containing a single `skill.md` with frontmatter — agents auto-load the relevant skill when the prompt matches its `description`.

> For repo-wide conventions, see [`../copilot-instructions.md`](../copilot-instructions.md).

## 📄 References

- [Agent Skills spec](https://agentskills.io/specification)
- [dbt-labs/dbt-agent-skills](https://github.com/dbt-labs/dbt-agent-skills) — upstream source for the 3 skills below
- [dbt-fabricspark adapter](https://github.com/microsoft/dbt-fabricspark) — the Spark / Fabric dbt adapter we run

## 💬 Human-in-the-loop

Most skills here are **agent-loadable** (`user-invocable: false`) — they fire automatically when the prompt matches. Skills marked **`user-invocable: true`** are explicit, interactive workflows you invoke in chat:

```bash
/fleet @projects/spark-dbt/.github/skills/<skill>/skill.md
```

## 📚 Available skills

### [`kimball-dbml`](kimball-dbml/skill.md) — `user-invocable`

Interactive workflow to design a Kimball STAR-schema **dbml file** from a directory of local Delta tables + a list of business questions. Profiles the source with DuckDB (`delta_scan()`), proposes conformed + local dims and fact tables, validates that every business question can be answered, surfaces bonus insights, and emits a committed `<dbt-project>/erd/<name>.dbml` as the design spec. The dbml is the only artefact that lands in git; the analysis lives in a gitignored `tmp/` folder.

Companion reference: [`kimball-dbml/KIMBALL_GUIDELINES.md`](kimball-dbml/KIMBALL_GUIDELINES.md) — generalized Kimball naming/SCD/snapshot-additivity/dbml-authoring rules.

```bash
/fleet @projects/spark-dbt/.github/skills/kimball-dbml/skill.md
```

### [`using-dbt-for-analytics-engineering`](using-dbt-for-analytics-engineering/skill.md)

Building & modifying dbt models using `{{ ref() }}` / `{{ source() }}`, writing tests, validating with `dbt show`. The default skill for any model authoring on `dbt-jaffle-shop` / `dbt-adventureworks` / `dbt-dataops`. Tailored to Kimball STAR (sources → `stg_*` → `dim_*` / `fct_*` / `obt_*`).

### [`adding-dbt-unit-test`](adding-dbt-unit-test/skill.md)

Author unit tests (Model-Inputs-Outputs YAML) for dbt models with complex logic — CASE WHENs, regex, window functions, multi-join transforms. Includes the Spark data-type caveat for `dbt-fabricspark`.

### [`fetching-dbt-docs`](fetching-dbt-docs/skill.md)

Look up dbt / dbt-fabricspark documentation in LLM-friendly Markdown — append `.md` to any `docs.getdbt.com` URL, search `llms.txt` first.

---

[Home](../../../../README.md) > [spark-dbt](../../README.md) > Skills
