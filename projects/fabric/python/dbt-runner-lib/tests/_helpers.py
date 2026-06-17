"""Shared test helpers: config payload factory + fake dbtRunner result objects."""

from __future__ import annotations

import copy
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any


def runner_payload(**overrides: Any) -> dict[str, Any]:
    """A minimal-but-complete valid ``runner`` payload; override any key."""
    payload: dict[str, Any] = {
        "project_name": "dbt-example",
        "project_dir": "/tmp/projects/dbt-example",
        "target": "local-local",
        "runtime": "local",
        "pipeline": [
            {"command": "deps"},
            {"command": "seed", "collect_metrics": True, "copy_run_results": True},
            {"command": "build", "exclude": ["resource_type:seed"], "collect_metrics": True, "copy_run_results": True},
        ],
        "metrics": {
            "enabled": True,
            "delta_path": "/tmp/.temp/metrics/dbt_node_executions",
            "raw_path": "/tmp/.temp/metrics/raw",
        },
    }
    merged = copy.deepcopy(payload)
    merged.update(overrides)
    return merged


# --- Fake dbtRunner result objects -------------------------------------------


def fake_timing(name: str, started: datetime, completed: datetime) -> SimpleNamespace:
    return SimpleNamespace(name=name, started_at=started, completed_at=completed)


def fake_node(**kwargs: Any) -> SimpleNamespace:
    base = dict(
        unique_id="model.example.dim_customer",
        resource_type="model",
        package_name="example",
        name="dim_customer",
        alias="dim_customer",
        database="db",
        schema="dbt_example_dwh",
        relation_name="`db`.`dbt_example_dwh`.`dim_customer`",
        original_file_path="models/marts/dim_customer.sql",
        config=SimpleNamespace(materialized="table", to_dict=lambda: {"materialized": "table"}),
        tags=["nightly"],
        depends_on=SimpleNamespace(nodes=["model.example.stg_customer"]),
        test_metadata=None,
    )
    base.update(kwargs)
    return SimpleNamespace(**base)


def fake_node_result(*, status: str = "success", rows_affected: int = 3, with_timing: bool = True) -> SimpleNamespace:
    start = datetime(2026, 6, 17, 10, 0, 0, tzinfo=timezone.utc)
    mid = datetime(2026, 6, 17, 10, 0, 1, tzinfo=timezone.utc)
    end = datetime(2026, 6, 17, 10, 0, 3, tzinfo=timezone.utc)
    timing = [fake_timing("compile", start, mid), fake_timing("execute", mid, end)] if with_timing else []
    return SimpleNamespace(
        node=fake_node(),
        timing=timing,
        adapter_response={"rows_affected": rows_affected, "_message": "OK"},
        failures=None,
        execution_time=3.0,
        thread_id="Thread-1",
        status=status,
        message="OK",
        to_dict=lambda: {"unique_id": "model.example.dim_customer", "status": status},
    )


def fake_invoke_result(*, success: bool = True, node_results: list[Any] | None = None, generated_at: datetime | None = None, exception: Any = None) -> SimpleNamespace:
    """Mimic the object returned by ``dbtRunner().invoke(...)``."""
    inner = None
    if node_results is not None:
        inner = SimpleNamespace(results=node_results, generated_at=generated_at or datetime(2026, 6, 17, 10, 0, 3, tzinfo=timezone.utc))
    return SimpleNamespace(success=success, result=inner, exception=exception)
