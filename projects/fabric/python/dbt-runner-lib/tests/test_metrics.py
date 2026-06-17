"""Tests for `dbt_runner.metrics` — normalization, schema parity, Delta flush."""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pyarrow as pa
import pytest

from _helpers import fake_invoke_result, fake_node_result, runner_payload
from dbt_runner.config import RunnerConfig
from dbt_runner.metrics import PA_SCHEMA, MetricsCollector, normalize_node_result
from dbt_runner.errors import MetricsWriteError

_NOW = datetime(2026, 6, 17, 10, 0, 3, tzinfo=timezone.utc)
_STARTED = datetime(2026, 6, 17, 9, 0, 0)


class TestNormalizeNodeResult:
    def test_row_is_schema_compatible(self):
        row = normalize_node_result("dbt-example", "build", fake_node_result(), _NOW, "inv-1", dbt_version="1.9.0", invocation_started_at=_STARTED)
        # Building a table with PA_SCHEMA proves every field type matches.
        table = pa.Table.from_pylist([row], schema=PA_SCHEMA)
        assert table.num_rows == 1

    def test_core_fields(self):
        row = normalize_node_result("dbt-example", "build", fake_node_result(rows_affected=7), _NOW, "inv-1", dbt_version="1.9.0", invocation_started_at=_STARTED)
        assert row["project"] == "dbt-example"
        assert row["command"] == "build"
        assert row["invocation_id"] == "inv-1"
        assert row["dbt_version"] == "1.9.0"
        assert row["unique_id"] == "model.example.dim_customer"
        assert row["rows_affected"] == 7
        assert row["materialized"] == "table"
        assert row["compile_time"] == 1.0
        assert row["execute_time"] == 2.0
        assert row["event_year_month"] == "202606"
        assert row["tags"] == ["nightly"]
        assert row["depends_on_nodes"] == ["model.example.stg_customer"]
        assert json.loads(row["adapter_response_json"])["rows_affected"] == 7

    def test_handles_missing_timing(self):
        row = normalize_node_result("p", "seed", fake_node_result(with_timing=False), _NOW, None, dbt_version="x", invocation_started_at=_STARTED)
        assert row["compile_time"] is None
        assert row["execute_time"] is None
        # Falls back to generated_at for the partition.
        assert row["event_year_month"] == "202606"


def _cfg(tmp_path, **metrics_overrides):
    metrics = {"enabled": True, "delta_path": str(tmp_path / "delta" / "dbt_node_executions"), "raw_path": str(tmp_path / "raw")}
    metrics.update(metrics_overrides)
    return RunnerConfig.from_mapping(runner_payload(metrics=metrics))


class _Local:
    is_fabric = False

    def get_token(self, audience):
        raise AssertionError("local runtime should not need a token")

    def storage_options(self):
        return None

    def onelake_context(self):
        return None, None


class TestMetricsCollectorFlush:
    def test_collect_and_flush_writes_delta(self, tmp_path):
        from deltalake import DeltaTable

        cfg = _cfg(tmp_path)
        collector = MetricsCollector(cfg)
        result = fake_invoke_result(success=True, node_results=[fake_node_result(), fake_node_result()])
        collector.collect("build", result)
        assert len(collector.buffer) == 2

        written = collector.flush_to_delta(_Local())
        assert written == 2

        dt = DeltaTable(str(tmp_path / "delta" / "dbt_node_executions"))
        table = dt.to_pyarrow_table()
        assert table.num_rows == 2
        assert set(table.column("project").to_pylist()) == {"dbt-example"}
        # Partitioned by project + event_year_month.
        assert set(dt.metadata().partition_columns) == {"project", "event_year_month"}

    def test_flush_empty_buffer_writes_nothing(self, tmp_path):
        cfg = _cfg(tmp_path)
        assert MetricsCollector(cfg).flush_to_delta(_Local()) == 0

    def test_collect_is_noop_for_resultless_command(self, tmp_path):
        cfg = _cfg(tmp_path)
        collector = MetricsCollector(cfg)
        collector.collect("deps", fake_invoke_result(success=True, node_results=None))
        assert collector.buffer == []

    def test_disabled_metrics_flush_returns_zero(self, tmp_path):
        cfg = RunnerConfig.from_mapping(runner_payload(pipeline=[{"command": "build"}], metrics={"enabled": False}))
        collector = MetricsCollector(cfg)
        assert collector.flush_to_delta(_Local()) == 0

    def test_copy_run_results(self, tmp_path):
        # copy_run_results reads <project_dir>/target/run_results.json
        proj_target = tmp_path / "target"
        (proj_target).mkdir(parents=True)
        (proj_target / "run_results.json").write_text('{"results": []}')
        cfg = RunnerConfig.from_mapping(
            runner_payload(
                project_dir=str(tmp_path),
                metrics={"enabled": True, "delta_path": str(tmp_path / "d"), "raw_path": str(tmp_path / "raw")},
            )
        )
        collector = MetricsCollector(cfg)
        collector.copy_run_results("build")
        assert (tmp_path / "raw" / "run_results-build.json").is_file()

    def test_archive_previous_raw(self, tmp_path):
        raw = tmp_path / "raw"
        raw.mkdir()
        (raw / "run_results-build.json").write_text("{}")
        cfg = _cfg(tmp_path)
        MetricsCollector(cfg).archive_previous_raw(["build"])
        # Original renamed away; an archived copy exists.
        assert not (raw / "run_results-build.json").exists()
        assert any(p.name.startswith("run_results-build-archived-at-") for p in raw.iterdir())
