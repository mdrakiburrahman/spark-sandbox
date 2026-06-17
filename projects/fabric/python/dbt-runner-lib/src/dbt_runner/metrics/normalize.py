"""Flatten a single ``dbtRunner`` node result into a ``PA_SCHEMA``-shaped dict."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any


def resolve_dbt_version() -> str:
    try:
        from dbt.version import __version__ as version

        return version
    except Exception:
        return "unknown"


def resolve_invocation_id() -> str | None:
    try:
        from dbt_common.invocation import get_invocation_id

        return get_invocation_id()
    except Exception:
        return None


def _safe_json(obj: Any) -> str | None:
    """Serialize anything to a JSON string, never raising."""
    if obj is None:
        return None
    try:
        return json.dumps(obj, default=str)
    except Exception:
        try:
            return json.dumps(str(obj))
        except Exception:
            return None


def _seconds_between(start: Any, end: Any) -> float | None:
    if start is not None and end is not None:
        return (end - start).total_seconds()
    return None


def normalize_node_result(
    project: str,
    command: str,
    r: Any,
    generated_at: Any,
    invocation_id: str | None,
    *,
    dbt_version: str,
    invocation_started_at: datetime,
) -> dict[str, Any]:
    node = getattr(r, "node", None)
    cfg = getattr(node, "config", None)

    compile_started = compile_completed = execute_started = execute_completed = None
    for ti in getattr(r, "timing", None) or []:
        if ti.name == "compile":
            compile_started, compile_completed = ti.started_at, ti.completed_at
        elif ti.name == "execute":
            execute_started, execute_completed = ti.started_at, ti.completed_at

    adapter = getattr(r, "adapter_response", None) or {}
    rows_affected = adapter.get("rows_affected") if isinstance(adapter, dict) else None
    failures = getattr(r, "failures", None)

    depends_on = getattr(node, "depends_on", None)
    depends_on_nodes = list(getattr(depends_on, "nodes", None) or []) if depends_on is not None else []
    test_metadata = getattr(node, "test_metadata", None)

    part_dt = execute_completed or generated_at or invocation_started_at

    return {
        "project": project,
        "command": command,
        "invocation_id": invocation_id,
        "dbt_version": dbt_version,
        "generated_at": generated_at,
        "unique_id": getattr(node, "unique_id", None),
        "resource_type": str(getattr(node, "resource_type", "") or "") or None,
        "package_name": getattr(node, "package_name", None),
        "name": getattr(node, "name", None),
        "alias": getattr(node, "alias", None),
        "database": getattr(node, "database", None),
        "schema_name": getattr(node, "schema", None),
        "relation_name": getattr(node, "relation_name", None),
        "original_file_path": getattr(node, "original_file_path", None),
        "materialized": getattr(cfg, "materialized", None),
        "execution_time": getattr(r, "execution_time", None),
        "compile_started_at": compile_started,
        "compile_completed_at": compile_completed,
        "compile_time": _seconds_between(compile_started, compile_completed),
        "execute_started_at": execute_started,
        "execute_completed_at": execute_completed,
        "execute_time": _seconds_between(execute_started, execute_completed),
        "thread_id": getattr(r, "thread_id", None),
        "status": str(getattr(r, "status", "") or "") or None,
        "rows_affected": int(rows_affected) if isinstance(rows_affected, (int, float)) else None,
        "failures": int(failures) if failures is not None else None,
        "message": getattr(r, "message", None),
        "tags": list(getattr(node, "tags", None) or []),
        "depends_on_nodes": depends_on_nodes,
        "adapter_response_json": _safe_json(adapter),
        "config_json": _safe_json(cfg.to_dict() if hasattr(cfg, "to_dict") else cfg),
        "test_metadata_json": _safe_json(test_metadata.to_dict() if hasattr(test_metadata, "to_dict") else test_metadata),
        "raw_json": _safe_json(r.to_dict() if hasattr(r, "to_dict") else None),
        "event_year_month": part_dt.strftime("%Y%m") if part_dt is not None else None,
    }
