"""Tests for `dbt_runner.metrics.delta_sink`."""

from __future__ import annotations

import pytest

from dbt_runner.errors import MetricsWriteError
from dbt_runner.metrics.delta_sink import DeltaMetricsSink, resolve_delta_target
from dbt_runner.runtime import LocalRuntime


class _FakeFabricRuntime:
    is_fabric = True

    def __init__(self, ws=None, lh=None):
        self._ws = ws
        self._lh = lh

    def get_token(self, audience):
        return "tok"

    def storage_options(self):
        return {"bearer_token": "tok", "use_fabric_endpoint": "true"}

    def onelake_context(self):
        return self._ws, self._lh


class TestResolveDeltaTarget:
    def test_local_path_returns_no_storage_options(self, tmp_path):
        target = str(tmp_path / "metrics" / "dbt_node_executions")
        uri, opts = resolve_delta_target(target, LocalRuntime())
        assert uri == target
        assert opts is None
        assert (tmp_path / "metrics").is_dir()  # parent created eagerly

    def test_abfss_passthrough_with_storage_options(self):
        rt = _FakeFabricRuntime()
        uri, opts = resolve_delta_target("abfss://ws@onelake.dfs.fabric.microsoft.com/lh/Tables/m", rt)
        assert uri == "abfss://ws@onelake.dfs.fabric.microsoft.com/lh/Tables/m"
        assert opts == {"bearer_token": "tok", "use_fabric_endpoint": "true"}

    def test_onelake_fuse_path_rewritten(self):
        rt = _FakeFabricRuntime(ws="ws-1", lh="lh-1")
        uri, opts = resolve_delta_target("/lakehouse/default/Files/raw/dbt/dbt_node_executions", rt)
        assert uri == "abfss://ws-1@onelake.dfs.fabric.microsoft.com/lh-1/Files/raw/dbt/dbt_node_executions"
        assert opts == {"bearer_token": "tok", "use_fabric_endpoint": "true"}

    def test_onelake_fuse_path_without_context_raises(self):
        rt = _FakeFabricRuntime(ws=None, lh=None)
        with pytest.raises(MetricsWriteError, match="workspace/lakehouse id unavailable"):
            resolve_delta_target("/lakehouse/default/Files/raw/m", rt)


class TestDeltaMetricsSink:
    def test_write_returns_count_and_uri(self, tmp_path):
        from datetime import datetime, timezone

        from deltalake import DeltaTable

        from _helpers import fake_node_result, runner_payload
        from dbt_runner.config import RunnerConfig
        from dbt_runner.metrics.normalize import normalize_node_result

        delta_path = str(tmp_path / "delta" / "dbt_node_executions")
        cfg = RunnerConfig.from_mapping(runner_payload(metrics={"enabled": True, "delta_path": delta_path}))
        row = normalize_node_result("dbt-example", "build", fake_node_result(), datetime(2026, 6, 17, tzinfo=timezone.utc), "inv", dbt_version="1.9", invocation_started_at=datetime(2026, 6, 17))
        written, uri = DeltaMetricsSink(cfg).write([row], LocalRuntime())
        assert written == 1
        assert uri == delta_path
        assert DeltaTable(delta_path).to_pyarrow_table().num_rows == 1

    def test_write_without_delta_path_raises(self):
        from _helpers import runner_payload
        from dbt_runner.config import RunnerConfig

        cfg = RunnerConfig.from_mapping(runner_payload(pipeline=[{"command": "build"}], metrics={"enabled": False}))
        with pytest.raises(MetricsWriteError, match="delta_path is not set"):
            DeltaMetricsSink(cfg).write([{"project": "x"}], LocalRuntime())
