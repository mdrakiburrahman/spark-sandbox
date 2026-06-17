"""Tests for `dbt_runner.runtime`."""

from __future__ import annotations

import sys
import types

import pytest

from _helpers import runner_payload
from dbt_runner.config import RunnerConfig
from dbt_runner.errors import FabricRuntimeUnavailableError
from dbt_runner.runtime import FabricRuntime, LocalRuntime, make_runtime


class TestMakeRuntime:
    def test_local(self):
        cfg = RunnerConfig.from_mapping(runner_payload(runtime="local"))
        assert isinstance(make_runtime(cfg), LocalRuntime)

    def test_fabric(self):
        cfg = RunnerConfig.from_mapping(runner_payload(runtime="fabric"))
        assert isinstance(make_runtime(cfg), FabricRuntime)


class TestLocalRuntime:
    def test_storage_options_none(self):
        assert LocalRuntime().storage_options() is None

    def test_onelake_context_empty(self):
        assert LocalRuntime().onelake_context() == (None, None)

    def test_get_token_raises(self):
        with pytest.raises(FabricRuntimeUnavailableError, match="local"):
            LocalRuntime().get_token("pbi")


class TestFabricRuntime:
    def test_get_token_without_notebookutils(self):
        sys.modules.pop("notebookutils", None)
        with pytest.raises(FabricRuntimeUnavailableError, match="notebookutils"):
            FabricRuntime().get_token("storage")

    def test_get_token_and_storage_options(self, monkeypatch):
        nbu = types.ModuleType("notebookutils")
        nbu.credentials = types.SimpleNamespace(getToken=lambda audience: f"token-for-{audience}")
        monkeypatch.setitem(sys.modules, "notebookutils", nbu)
        rt = FabricRuntime()
        assert rt.get_token("storage") == "token-for-storage"
        assert rt.storage_options() == {"bearer_token": "token-for-storage", "use_fabric_endpoint": "true"}

    def test_get_token_rejects_empty(self, monkeypatch):
        nbu = types.ModuleType("notebookutils")
        nbu.credentials = types.SimpleNamespace(getToken=lambda audience: "")
        monkeypatch.setitem(sys.modules, "notebookutils", nbu)
        with pytest.raises(FabricRuntimeUnavailableError, match="returned"):
            FabricRuntime().get_token("storage")

    def test_onelake_context(self, monkeypatch):
        nbu = types.ModuleType("notebookutils")
        nbu.runtime = types.SimpleNamespace(context={"defaultLakehouseWorkspaceId": "ws-1", "defaultLakehouseId": "lh-1"})
        monkeypatch.setitem(sys.modules, "notebookutils", nbu)
        assert FabricRuntime().onelake_context() == ("ws-1", "lh-1")

    def test_onelake_context_falls_back_to_current_workspace(self, monkeypatch):
        nbu = types.ModuleType("notebookutils")
        nbu.runtime = types.SimpleNamespace(context={"currentWorkspaceId": "ws-2", "defaultLakehouseId": "lh-2"})
        monkeypatch.setitem(sys.modules, "notebookutils", nbu)
        assert FabricRuntime().onelake_context() == ("ws-2", "lh-2")
