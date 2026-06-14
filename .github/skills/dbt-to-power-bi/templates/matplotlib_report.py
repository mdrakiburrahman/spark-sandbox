"""
Power BI-style matplotlib report skeleton.

Renders a single-page PNG mock-up of a Power BI report. The output is meant
as a *blueprint* — a visual reference the user can iterate on before
recreating it in Power BI proper.

Usage from a tmp folder (e.g. projects/spark-dbt/.temp/pbi-tool/):

    python3 -m venv venv && source venv/bin/activate
    pip install -r requirements.txt
    REPORT_VERSION=v1 python report.py

requirements.txt (pin these — known good):

    deltalake==1.6.0
    matplotlib==3.10.9
    numpy==2.2.6
    pandas==2.3.3
    pyarrow==24.0.0
"""
from __future__ import annotations

import os
from pathlib import Path

import matplotlib.pyplot as plt
import matplotlib.patches as patches
import pandas as pd
from deltalake import DeltaTable

# ---------- EDIT THESE ----------
# On local-local, the Spark warehouse is the Hive metastore-backed Delta dir.
# Common locations: /tmp/spark-warehouse/<schema>.db, or wherever your dbt
# `lakehouse` config under projects/spark-dbt/dbt-<name>/profiles.yml writes.
WAREHOUSE = Path("/tmp/spark-warehouse/<schema>.db")
OUT_DIR = Path("projects/spark-dbt/.temp/report-draft")
VERSION = os.environ.get("REPORT_VERSION", "v1")
# --------------------------------

# === Power BI–ish theme ===
PBI = {
    "bg":        "#F3F2F1",
    "card":      "#FFFFFF",
    "ink":       "#252423",
    "muted":     "#605E5C",
    "accent":    "#118DFF",
    "warn":      "#D13438",
    "good":      "#107C10",
    "grid":      "#E1DFDD",
}
SUITE_PALETTE = ["#118DFF", "#12239E", "#E66C37", "#6B007B", "#118DFF",
                 "#D13438", "#FFB900", "#107C10", "#00B294", "#5C2D91"]

plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "axes.edgecolor": PBI["grid"],
    "axes.labelcolor": PBI["muted"],
    "axes.titlecolor": PBI["ink"],
    "xtick.color": PBI["muted"],
    "ytick.color": PBI["muted"],
    "axes.grid": True,
    "grid.color": PBI["grid"],
    "grid.linewidth": 0.6,
    "figure.facecolor": PBI["bg"],
    "axes.facecolor": PBI["card"],
})


def panel(ax, title: str) -> None:
    ax.set_title(title, fontsize=12, fontweight="bold", loc="left", pad=8)
    for spine in ("top", "right"):
        ax.spines[spine].set_visible(False)


def draw_card(fig, x, y, w, h, value: str, label: str, accent: str = PBI["accent"]) -> None:
    """KPI card with big value, small label, left accent bar."""
    rect = patches.FancyBboxPatch(
        (x, y), w, h,
        boxstyle="round,pad=0.005,rounding_size=0.01",
        linewidth=0, facecolor=PBI["card"], transform=fig.transFigure,
    )
    fig.add_artist(rect)
    bar = patches.Rectangle((x, y), 0.004, h, facecolor=accent, transform=fig.transFigure)
    fig.add_artist(bar)
    fig.text(x + 0.012, y + h * 0.55, value, fontsize=26, fontweight="bold",
             color=PBI["ink"], transform=fig.transFigure)
    fig.text(x + 0.012, y + h * 0.18, label, fontsize=10,
             color=PBI["muted"], transform=fig.transFigure)


def load(table: str) -> pd.DataFrame:
    return DeltaTable(str(WAREHOUSE / table)).to_pandas()


# === Load dbt-built dims/facts ===
dim_date     = load("dim_date")
dim_suite    = load("dim_test_suite")
dim_owner    = load("dim_owner")
fact_failed  = load("fact_failed_test_case")
fact_outcome = load("fact_suite_build_outcome")
fact_mtbf    = load("fact_mtbf_summary")
fact_dur     = load("fact_test_duration_daily")

# === KPIs ===
total_builds  = fact_outcome["build_id"].nunique()
tests_run     = int(fact_outcome["total_tests"].sum())
failed_total  = int(fact_outcome["failed_tests"].sum())
pass_rate     = (tests_run - failed_total) / tests_run if tests_run else 0
active_broken = int(fact_mtbf.query("reliability_tier == 'Broken'").shape[0])

# === Figure ===
fig = plt.figure(figsize=(16, 9), dpi=120)

# Header band
fig.text(0.01, 0.965, "<Report Title>", fontsize=22,
         fontweight="bold", color=PBI["ink"])
fig.text(0.01, 0.94, "<Report subtitle / one-line description>",
         fontsize=10, color=PBI["muted"])

# KPI strip (figure-fraction coords)
draw_card(fig, 0.01, 0.84, 0.235, 0.08, f"{total_builds:,}",  "Total Builds")
draw_card(fig, 0.255, 0.84, 0.235, 0.08, f"{tests_run:,}",    "Tests Run")
draw_card(fig, 0.50, 0.84, 0.235, 0.08, f"{pass_rate:.1%}",   "Pass Rate", PBI["good"])
draw_card(fig, 0.745, 0.84, 0.245, 0.08, f"{active_broken:,}", "Active Broken Tests", PBI["warn"])

gs = fig.add_gridspec(
    nrows=2, ncols=2, left=0.01, right=0.99, top=0.81, bottom=0.04,
    height_ratios=[1, 1], width_ratios=[3, 2], hspace=0.30, wspace=0.05,
)

# --- Top-left: failures over time (legend = top suites) ---
ax1 = fig.add_subplot(gs[0, 0])
panel(ax1, "Test Failures Over Time")
fail_by_suite = (
    fact_failed.merge(dim_suite[["suite_id", "suite_name"]], on="suite_id", how="left")
               .groupby([pd.to_datetime(fact_failed["failure_date"]), "suite_name"])
               .size().rename("fails").reset_index()
)
top_suites = fail_by_suite.groupby("suite_name")["fails"].sum().nlargest(8).index
for i, suite in enumerate(top_suites):
    s = fail_by_suite[fail_by_suite["suite_name"] == suite]
    ax1.plot(s["failure_date"], s["fails"],
             marker="o", linewidth=2, color=SUITE_PALETTE[i % len(SUITE_PALETTE)],
             label=suite[:30])
ax1.legend(loc="upper left", fontsize=7, frameon=False, ncol=2)

# --- Top-right: failures by owner ---
ax2 = fig.add_subplot(gs[0, 1])
panel(ax2, "Failed Tests by Owner Over Time")
fail_by_owner = (
    fact_failed.merge(dim_owner[["owner_email", "owner_display_name"]],
                      on="owner_email", how="left")
               .groupby([pd.to_datetime(fact_failed["failure_date"]),
                         "owner_display_name"])
               .size().rename("fails").reset_index()
)
top_owners = fail_by_owner.groupby("owner_display_name")["fails"].sum().nlargest(6).index
for i, owner in enumerate(top_owners):
    s = fail_by_owner[fail_by_owner["owner_display_name"] == owner]
    ax2.plot(s["failure_date"], s["fails"],
             marker="o", linewidth=2, color=SUITE_PALETTE[i % len(SUITE_PALETTE)],
             label=str(owner)[:25])
ax2.legend(loc="upper left", fontsize=7, frameon=False)

# --- Bottom-left: P50/P95 trend (line) + suites-per-day (bar overlay or own panel) ---
ax3 = fig.add_subplot(gs[1, 0])
panel(ax3, "Test Duration Trend")
d = fact_dur.groupby(pd.to_datetime(fact_dur["duration_date"])).agg(
    p50=("p50_ms", "mean"), p95=("p95_ms", "mean")
).reset_index()
ax3.plot(d["duration_date"], d["p50"] / 1000, label="P50 (s)", color=PBI["accent"], lw=2)
ax3.plot(d["duration_date"], d["p95"] / 1000, label="P95 (s)", color=PBI["warn"], lw=2)
ax3.legend(loc="upper left", fontsize=8, frameon=False)

# --- Bottom-right: worst offenders ---
ax4 = fig.add_subplot(gs[1, 1])
panel(ax4, "Worst Offenders — Top 10")
ax4.axis("off")
worst = fact_mtbf.nlargest(10, "failure_rate_pct")[
    ["suite_name", "failure_count", "failure_rate_pct", "mtbf_days"]
]
worst.columns = ["Suite", "Fails", "Fail %", "MTBF days"]
tbl = ax4.table(cellText=worst.values, colLabels=worst.columns,
                loc="center", cellLoc="left", colLoc="left")
tbl.auto_set_font_size(False); tbl.set_fontsize(8); tbl.scale(1, 1.4)

# === Save ===
OUT_DIR.mkdir(parents=True, exist_ok=True)
out = OUT_DIR / f"report-{VERSION}.png"
plt.savefig(out, dpi=120, bbox_inches="tight", facecolor=PBI["bg"])
print(f"wrote {out}")
