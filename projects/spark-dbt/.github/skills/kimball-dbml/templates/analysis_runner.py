"""
DuckDB-based profiler for a directory of Delta tables.

Scans every subdirectory of --db that contains a `_delta_log/` folder, treats
each as a Delta table, and emits a Markdown analysis report covering:

- Row count + schema per table
- Null rate + distinct count per column (capped to keep wide tables fast)
- Value distributions for low-cardinality columns (<= 30 distinct values)
- Min/max range for date/timestamp columns
- Foreign-key candidates across tables (columns with matching names and high
  distinct-value overlap)

Usage:

    pip install duckdb pandas
    python3 analysis_runner.py \\
        --db /tmp/.mnt/onelake/<source_db> \\
        --out tmp/analysis.md

The output is intended to be committed to a gitignored `tmp/` folder inside
the new dbt project (see the kimball-dbml skill, Step 6).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from textwrap import dedent

import duckdb
import pandas as pd

# Caps to keep wide tables fast. Override via CLI if needed.
MAX_COLS_FOR_PROFILE = 60
LOW_CARDINALITY_THRESHOLD = 30
TOP_VALUES_PREVIEW = 5
SAMPLE_ROWS = 5


def discover_delta_tables(root: Path) -> list[Path]:
    """Return every subdirectory of `root` that contains a `_delta_log/` folder."""
    if not root.exists():
        raise FileNotFoundError(f"--db path does not exist: {root}")
    return sorted(p for p in root.iterdir() if (p / "_delta_log").is_dir())


def init_duckdb() -> duckdb.DuckDBPyConnection:
    """Return a DuckDB connection with the delta extension loaded."""
    con = duckdb.connect()
    con.execute("INSTALL delta")
    con.execute("LOAD delta")
    return con


def profile_table(con: duckdb.DuckDBPyConnection, table_path: Path) -> dict:
    """Return a profile dict for one Delta table."""
    qpath = str(table_path).replace("'", "''")
    src = f"delta_scan('{qpath}')"

    row_count = con.execute(f"SELECT COUNT(*) FROM {src}").fetchone()[0]
    schema = con.execute(f"DESCRIBE SELECT * FROM {src}").fetchdf()
    columns = schema["column_name"].tolist()
    types = dict(zip(schema["column_name"], schema["column_type"]))

    profile = {
        "path": str(table_path),
        "name": table_path.name,
        "row_count": row_count,
        "columns": [],
        "sample": None,
    }

    if row_count == 0:
        return profile

    profile["sample"] = con.execute(f"SELECT * FROM {src} LIMIT {SAMPLE_ROWS}").fetchdf()

    cols_to_profile = columns[:MAX_COLS_FOR_PROFILE]
    for col in cols_to_profile:
        qcol = f'"{col}"'
        col_type = types[col]
        col_entry = {"name": col, "type": col_type}

        try:
            stats = con.execute(f"""
                SELECT
                    COUNT(*)              AS total,
                    COUNT({qcol})         AS non_null,
                    COUNT(DISTINCT {qcol}) AS distinct_n
                FROM {src}
                """).fetchone()
            total, non_null, distinct_n = stats
            col_entry["null_rate"] = 1.0 - (non_null / total) if total else 0.0
            col_entry["distinct"] = distinct_n
        except duckdb.Error as exc:
            col_entry["error"] = str(exc).splitlines()[0]
            profile["columns"].append(col_entry)
            continue

        if 0 < distinct_n <= LOW_CARDINALITY_THRESHOLD:
            try:
                top_vals = con.execute(f"""
                    SELECT {qcol} AS value, COUNT(*) AS n
                    FROM {src}
                    WHERE {qcol} IS NOT NULL
                    GROUP BY {qcol}
                    ORDER BY n DESC
                    LIMIT {TOP_VALUES_PREVIEW}
                    """).fetchall()
                col_entry["top_values"] = top_vals
            except duckdb.Error:
                pass

        if any(t in col_type.upper() for t in ("DATE", "TIMESTAMP", "TIME")):
            try:
                rng = con.execute(f"SELECT MIN({qcol}), MAX({qcol}) FROM {src}").fetchone()
                col_entry["min"], col_entry["max"] = rng
            except duckdb.Error:
                pass

        profile["columns"].append(col_entry)

    return profile


def find_fk_candidates(profiles: list[dict]) -> list[dict]:
    """Find pairs of (table.col, other_table.col) with the same name that may be FK candidates."""
    by_name: dict[str, list[tuple[str, dict]]] = {}
    for prof in profiles:
        for col in prof["columns"]:
            by_name.setdefault(col["name"], []).append((prof["name"], col))

    candidates = []
    for col_name, occurrences in by_name.items():
        if len(occurrences) < 2:
            continue
        sorted_by_distinct = sorted(occurrences, key=lambda x: x[1].get("distinct", 0), reverse=True)
        parent_table, parent_col = sorted_by_distinct[0]
        for child_table, child_col in sorted_by_distinct[1:]:
            candidates.append(
                {
                    "column": col_name,
                    "parent": parent_table,
                    "parent_distinct": parent_col.get("distinct"),
                    "child": child_table,
                    "child_distinct": child_col.get("distinct"),
                }
            )
    return candidates


def format_value(v) -> str:
    """Format a Python/duckdb value for Markdown table inclusion."""
    if v is None:
        return "_(null)_"
    s = str(v)
    if len(s) > 60:
        s = s[:57] + "…"
    return s.replace("|", "\\|").replace("\n", " ")


def render_markdown(db_root: Path, profiles: list[dict], fk_candidates: list[dict]) -> str:
    """Render the full Markdown report."""
    lines: list[str] = []
    lines.append(f"# Data Analysis — `{db_root.name}`")
    lines.append("")
    lines.append(f"Source: `{db_root}`  ")
    lines.append(f"Tables found: **{len(profiles)}**  ")
    lines.append("")
    lines.append("> Generated by `kimball-dbml/templates/analysis_runner.py`. " "**Not committed** — gitignored under `<dbt-project>/tmp/`.")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## Summary")
    lines.append("")
    lines.append("| Table | Rows | Cols |")
    lines.append("| --- | ---: | ---: |")
    for prof in profiles:
        lines.append(f"| `{prof['name']}` | {prof['row_count']:,} | {len(prof['columns'])} |")
    lines.append("")

    for prof in profiles:
        lines.append("---")
        lines.append("")
        lines.append(f"## `{prof['name']}`")
        lines.append("")
        lines.append(f"- **Path**: `{prof['path']}`")
        lines.append(f"- **Rows**: {prof['row_count']:,}")
        lines.append(f"- **Columns profiled**: {len(prof['columns'])}")
        lines.append("")

        if prof["row_count"] == 0:
            lines.append("_(empty table — skipping column profile)_")
            lines.append("")
            continue

        lines.append("### Schema + profile")
        lines.append("")
        lines.append("| Column | Type | Null % | Distinct | Notes |")
        lines.append("| --- | --- | ---: | ---: | --- |")
        for col in prof["columns"]:
            null_pct = f"{col.get('null_rate', 0) * 100:.1f}%"
            distinct = col.get("distinct")
            distinct_str = f"{distinct:,}" if distinct is not None else "?"
            notes = []
            if "min" in col and "max" in col:
                notes.append(f"range: {format_value(col['min'])} → {format_value(col['max'])}")
            if "top_values" in col:
                tops = ", ".join(f"`{format_value(v)}` ({n:,})" for v, n in col["top_values"])
                notes.append(f"top: {tops}")
            if "error" in col:
                notes.append(f"⚠️ {col['error']}")
            lines.append(f"| `{col['name']}` | `{col['type']}` | {null_pct} | " f"{distinct_str} | {' · '.join(notes) if notes else ''} |")
        lines.append("")

        if prof["sample"] is not None and not prof["sample"].empty:
            lines.append(f"### Sample rows (first {SAMPLE_ROWS})")
            lines.append("")
            lines.append("```")
            with pd.option_context("display.max_colwidth", 60, "display.width", 200):
                lines.append(prof["sample"].to_string(index=False))
            lines.append("```")
            lines.append("")

    if fk_candidates:
        lines.append("---")
        lines.append("")
        lines.append("## Cross-Table Foreign-Key Candidates")
        lines.append("")
        lines.append("Columns appearing in more than one table — likely FK relationships. " "Highest-distinct-count table is shown as the inferred parent.")
        lines.append("")
        lines.append("| Column | Parent table | Parent distinct | Child table | Child distinct |")
        lines.append("| --- | --- | ---: | --- | ---: |")
        for fk in fk_candidates:
            lines.append(f"| `{fk['column']}` | `{fk['parent']}` | " f"{fk['parent_distinct']:,} | `{fk['child']}` | " f"{fk['child_distinct']:,} |")
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("_Next: use these findings to draft the bus matrix (see " "`templates/bus_matrix_template.md`) and the dbml (see `templates/dbml-skeleton.dbml`)._")
    lines.append("")

    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--db",
        type=Path,
        required=True,
        help="Root directory containing one subdirectory per Delta table.",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("tmp/analysis.md"),
        help="Markdown output path. Default: tmp/analysis.md",
    )
    args = parser.parse_args()

    tables = discover_delta_tables(args.db)
    if not tables:
        print(
            f"No Delta tables found under {args.db} " "(looking for subdirs containing _delta_log/).",
            file=sys.stderr,
        )
        return 1

    con = init_duckdb()
    profiles = []
    for t in tables:
        print(f"Profiling {t.name} …", file=sys.stderr)
        try:
            profiles.append(profile_table(con, t))
        except duckdb.Error as exc:
            print(f"  ⚠️ skipping {t.name}: {exc}", file=sys.stderr)

    fk_candidates = find_fk_candidates(profiles)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(render_markdown(args.db, profiles, fk_candidates))
    print(f"\nWrote {args.out} ({len(profiles)} tables, {len(fk_candidates)} FK candidates)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
