"""
PBIR visual generator — template-cloned from a known-working PBIR report.

Edit the constants and the `=== Build visuals ===` section at the bottom to
match the dashboard you want to recreate.

Outputs one folder per visual under
    <report>/definition/pages/<page-id>/visuals/<20-char-hex>/visual.json
and updates page dimensions on
    <report>/definition/pages/<page-id>/page.json

Run:
    python3 generate_pbir_visuals.py
"""

import json
import secrets
from pathlib import Path

# ---------- EDIT THESE ----------
REPORT_DIR = Path("projects/fabric/workspace-automation/<workspace>/Reports/<area>/" "<report-name>.Report")
PAGE_ID = "2192ed549b4ba38d30bc"  # set from pages.json
CANVAS_WIDTH = 1600
CANVAS_HEIGHT = 900
MEASURES_TABLE = "Report Measures"  # friendly name of the measures table
# --------------------------------

PAGE_DIR = REPORT_DIR / "definition" / "pages" / PAGE_ID
VISUALS_DIR = PAGE_DIR / "visuals"
VISUALS_DIR.mkdir(parents=True, exist_ok=True)


def hex20() -> str:
    return secrets.token_hex(10)


def lit(v: str) -> dict:
    return {"expr": {"Literal": {"Value": v}}}


def measure_ref(entity: str, prop: str, display: str | None = None, native: str | None = None) -> dict:
    d = {
        "field": {
            "Measure": {
                "Expression": {"SourceRef": {"Entity": entity}},
                "Property": prop,
            }
        },
        "queryRef": f"{entity}.{prop}",
        "nativeQueryRef": native or prop,
    }
    if display:
        d["displayName"] = display
    return d


def column_ref(entity: str, prop: str, native: str | None = None, active: bool = False) -> dict:
    d = {
        "field": {
            "Column": {
                "Expression": {"SourceRef": {"Entity": entity}},
                "Property": prop,
            }
        },
        "queryRef": f"{entity}.{prop}",
        "nativeQueryRef": native or prop,
    }
    if active:
        d["active"] = True
    return d


def title_obj(text: str, font_size: int = 12) -> dict:
    return {
        "title": [
            {
                "properties": {
                    "show": lit("true"),
                    "text": lit(f"'{text}'"),
                    "heading": lit("'Normal'"),
                    "fontSize": lit(f"{font_size}D"),
                }
            }
        ],
        "background": [{"properties": {"show": lit("false")}}],
    }


def card_visual(name, x, y, w, h, z, measure_property, title):
    return {
        "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.3.0/schema.json",
        "name": name,
        "position": {"x": x, "y": y, "z": z, "height": h, "width": w, "tabOrder": z},
        "visual": {
            "visualType": "card",
            "query": {"queryState": {"Values": {"projections": [measure_ref(MEASURES_TABLE, measure_property)]}}},
            "objects": {
                "categoryLabels": [{"properties": {"show": lit("true"), "fontSize": lit("10D")}}],
                "labels": [{"properties": {"fontSize": lit("28D")}}],
            },
            "visualContainerObjects": title_obj(title, font_size=10),
            "drillFilterOtherVisuals": True,
        },
    }


def textbox_visual(name, x, y, w, h, z, paragraphs):
    return {
        "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.3.0/schema.json",
        "name": name,
        "position": {"x": x, "y": y, "z": z, "height": h, "width": w, "tabOrder": z},
        "visual": {
            "visualType": "textbox",
            "objects": {"general": [{"properties": {"paragraphs": paragraphs}}]},
            "visualContainerObjects": {
                "background": [{"properties": {"show": lit("false")}}],
            },
            "drillFilterOtherVisuals": True,
        },
    }


def line_chart_visual(name, x, y, w, h, z, category, y_values, legend=None, title=""):
    qs = {
        "Category": {"projections": [category]},
        "Y": {"projections": y_values},
    }
    if legend:
        qs["Series"] = {"projections": [legend]}

    return {
        "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.4.0/schema.json",
        "name": name,
        "position": {"x": x, "y": y, "z": z, "height": h, "width": w, "tabOrder": z},
        "visual": {
            "visualType": "lineChart",
            "query": {
                "queryState": qs,
                "sortDefinition": {
                    "sort": [{"field": category["field"], "direction": "Ascending"}],
                    "isDefaultSort": True,
                },
            },
            "objects": {
                "lineStyles": [
                    {
                        "properties": {
                            "showMarker": lit("true"),
                            "markerSize": lit("4D"),
                            "strokeWidth": lit("2D"),
                        }
                    }
                ],
                "legend": [
                    {
                        "properties": {
                            "show": lit("true" if legend else "false"),
                            "position": lit("'Right'"),
                            "fontSize": lit("9D"),
                        }
                    }
                ],
                "valueAxis": [{"properties": {"show": lit("true"), "fontSize": lit("9D"), "showAxisTitle": lit("false")}}],
                "categoryAxis": [{"properties": {"show": lit("true"), "fontSize": lit("9D"), "showAxisTitle": lit("false"), "axisType": lit("'Scalar'")}}],
                "labels": [{"properties": {"show": lit("false")}}],
            },
            "visualContainerObjects": title_obj(title, font_size=12),
            "drillFilterOtherVisuals": True,
        },
    }


def column_chart_visual(name, x, y, w, h, z, category, y_value, title=""):
    """clusteredColumnChart — vertical bars."""
    return {
        "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.4.0/schema.json",
        "name": name,
        "position": {"x": x, "y": y, "z": z, "height": h, "width": w, "tabOrder": z},
        "visual": {
            "visualType": "clusteredColumnChart",
            "query": {
                "queryState": {
                    "Category": {"projections": [category]},
                    "Y": {"projections": [y_value]},
                },
                "sortDefinition": {
                    "sort": [{"field": category["field"], "direction": "Ascending"}],
                    "isDefaultSort": True,
                },
            },
            "objects": {
                "legend": [{"properties": {"show": lit("false")}}],
                "valueAxis": [{"properties": {"show": lit("true"), "fontSize": lit("9D"), "showAxisTitle": lit("false")}}],
                "categoryAxis": [{"properties": {"show": lit("true"), "fontSize": lit("9D"), "showAxisTitle": lit("false")}}],
                "labels": [{"properties": {"show": lit("true"), "fontSize": lit("9D")}}],
            },
            "visualContainerObjects": title_obj(title, font_size=12),
            "drillFilterOtherVisuals": True,
        },
    }


def table_visual(name, x, y, w, h, z, columns, title=""):
    return {
        "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.3.0/schema.json",
        "name": name,
        "position": {"x": x, "y": y, "z": z, "height": h, "width": w, "tabOrder": z},
        "visual": {
            "visualType": "tableEx",
            "query": {"queryState": {"Values": {"projections": columns}}},
            "objects": {
                "values": [{"properties": {"fontSize": lit("9D")}}],
                "columnHeaders": [{"properties": {"fontSize": lit("10D"), "bold": lit("true")}}],
            },
            "visualContainerObjects": title_obj(title, font_size=12),
            "drillFilterOtherVisuals": True,
        },
    }


def save(visual: dict) -> None:
    vd = VISUALS_DIR / visual["name"]
    vd.mkdir(parents=True, exist_ok=True)
    (vd / "visual.json").write_text(json.dumps(visual, indent=2))
    print(f"  wrote: {visual['name']}  ({visual['visual']['visualType']})")


# === Build visuals ===
# Update page size first
pj = json.loads((PAGE_DIR / "page.json").read_text())
pj["width"] = CANVAS_WIDTH
pj["height"] = CANVAS_HEIGHT
(PAGE_DIR / "page.json").write_text(json.dumps(pj, indent=2))
print(f"Page size: {CANVAS_WIDTH}x{CANVAS_HEIGHT}")

# --- Header ---
save(
    textbox_visual(
        hex20(),
        10,
        5,
        1580,
        55,
        10,
        [
            {"textRuns": [{"value": "<Report Title>", "textStyle": {"fontWeight": "bold", "fontSize": "22px", "color": "#252423"}}]},
            {"textRuns": [{"value": "<Report subtitle / one-line description>", "textStyle": {"color": "#605E5C", "fontSize": "11px"}}]},
        ],
    )
)

# --- KPI cards ---
save(card_visual(hex20(), 10, 70, 380, 100, 100, "Total Builds", "Total Builds"))
save(card_visual(hex20(), 410, 70, 380, 100, 110, "Tests Run", "Tests Run"))
save(card_visual(hex20(), 810, 70, 380, 100, 120, "Overall Pass Rate", "Overall Pass Rate"))
save(card_visual(hex20(), 1210, 70, 380, 100, 130, "Active Broken Tests", "Active Broken Tests"))

# --- Line chart: Failures over time, legend = suite ---
save(
    line_chart_visual(
        hex20(),
        10,
        185,
        920,
        280,
        200,
        category=column_ref("Date", "date", native="date", active=True),
        y_values=[measure_ref(MEASURES_TABLE, "Failed Tests", display="Failed Tests")],
        legend=column_ref("Test Suite", "suite_name", native="suite_name"),
        title="Test Failures Over Time",
    )
)

# --- Line chart: failures by owner ---
save(
    line_chart_visual(
        hex20(),
        945,
        185,
        645,
        280,
        210,
        category=column_ref("Date", "date", native="date", active=True),
        y_values=[measure_ref(MEASURES_TABLE, "Failed Test Cases", display="Failed Test Cases")],
        legend=column_ref("Test Owner", "owner_display_name", native="owner_display_name"),
        title="Failed Tests by Owner Over Time",
    )
)

# --- Table: worst offenders ---
save(
    table_visual(
        hex20(),
        10,
        480,
        920,
        410,
        300,
        columns=[
            column_ref("Test Suite", "suite_name", native="Suite"),
            column_ref("Pipeline", "definition_name", native="Pipeline"),
            measure_ref(MEASURES_TABLE, "Suite Failure Count", display="Fails"),
            measure_ref(MEASURES_TABLE, "Suite Failure Rate %", display="Fail %"),
            measure_ref(MEASURES_TABLE, "Suite Mean Time Between Failures (days)", display="MTBF days"),
        ],
        title="Worst Offenders — Top by Failure Rate",
    )
)

# --- Line chart: P50 vs P95 duration ---
save(
    line_chart_visual(
        hex20(),
        945,
        480,
        645,
        200,
        310,
        category=column_ref("Date", "date", native="date", active=True),
        y_values=[
            measure_ref(MEASURES_TABLE, "P50 Duration (seconds)", display="P50 (seconds)"),
            measure_ref(MEASURES_TABLE, "P95 Duration (seconds)", display="P95 (seconds)"),
        ],
        title="Test Duration Trend (P50 vs P95)",
    )
)

# --- Column chart: distinct suites per day ---
save(
    column_chart_visual(
        hex20(),
        945,
        695,
        645,
        195,
        320,
        category=column_ref("Date", "date", native="date", active=True),
        y_value=measure_ref(MEASURES_TABLE, "Distinct Suites Per Day", display="Distinct Suites"),
        title="Suites Executed per Day",
    )
)

print(f"\nTotal visuals: {len(list(VISUALS_DIR.iterdir()))}")
