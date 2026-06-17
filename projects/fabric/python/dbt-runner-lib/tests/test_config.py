"""Tests for `dbt_runner.config`."""

from __future__ import annotations

import base64
import textwrap

import pytest

from _helpers import runner_payload
from dbt_runner.config import (
    RUNTIME_FABRIC,
    RUNTIME_LOCAL,
    RunnerConfig,
    StepConfig,
    decode_base64,
    load_default_template,
    load_runner_config,
)
from dbt_runner.errors import RunnerConfigError


class TestRunnerConfigBasics:
    def test_minimal_valid(self):
        cfg = RunnerConfig.from_mapping(runner_payload())
        assert cfg.project_name == "dbt-example"
        assert cfg.profiles_dir == cfg.project_dir  # defaulted
        assert cfg.runtime == RUNTIME_LOCAL
        assert cfg.is_fabric is False
        assert len(cfg.pipeline) == 3
        assert cfg.metrics.partition_by == ("project", "event_year_month")

    def test_profiles_dir_explicit(self):
        cfg = RunnerConfig.from_mapping(runner_payload(profiles_dir="/somewhere/else"))
        assert cfg.profiles_dir == "/somewhere/else"

    def test_runtime_fabric_case_insensitive(self):
        cfg = RunnerConfig.from_mapping(runner_payload(runtime="Fabric"))
        assert cfg.runtime == RUNTIME_FABRIC
        assert cfg.is_fabric is True

    def test_vars_passthrough(self):
        cfg = RunnerConfig.from_mapping(runner_payload(vars={"region_filter": ["*"], "lookback_days": 30}))
        assert cfg.vars == {"region_filter": ["*"], "lookback_days": 30}


class TestRunnerConfigValidation:
    @pytest.mark.parametrize("missing", ["project_name", "project_dir", "target"])
    def test_required_fields(self, missing):
        payload = runner_payload()
        del payload[missing]
        with pytest.raises(RunnerConfigError, match=missing):
            RunnerConfig.from_mapping(payload)

    def test_pipeline_required_non_empty(self):
        with pytest.raises(RunnerConfigError, match="pipeline"):
            RunnerConfig.from_mapping(runner_payload(pipeline=[]))

    def test_unknown_runtime_rejected(self):
        with pytest.raises(RunnerConfigError, match="runtime"):
            RunnerConfig.from_mapping(runner_payload(runtime="kubernetes"))

    def test_vars_must_be_mapping(self):
        with pytest.raises(RunnerConfigError, match="vars"):
            RunnerConfig.from_mapping(runner_payload(vars=["not", "a", "map"]))

    def test_collect_metrics_requires_metrics_enabled(self):
        payload = runner_payload(metrics={"enabled": False})
        with pytest.raises(RunnerConfigError, match="collect_metrics"):
            RunnerConfig.from_mapping(payload)

    def test_metrics_delta_path_required_when_enabled(self):
        payload = runner_payload(
            pipeline=[{"command": "build"}],
            metrics={"enabled": True, "raw_path": "/tmp/raw"},
        )
        with pytest.raises(RunnerConfigError, match="delta_path"):
            RunnerConfig.from_mapping(payload)


class TestStepConfig:
    def test_run_operation_requires_macro(self):
        with pytest.raises(RunnerConfigError, match="macro"):
            StepConfig.from_mapping({"command": "run-operation"}, index=0)

    def test_run_operation_with_macro_and_if_exists(self):
        step = StepConfig.from_mapping({"command": "run-operation", "macro": "cleanup", "if_macro_exists": True}, index=0)
        assert step.macro == "cleanup"
        assert step.if_macro_exists is True

    def test_macro_only_for_run_operation(self):
        with pytest.raises(RunnerConfigError, match="run-operation"):
            StepConfig.from_mapping({"command": "build", "macro": "x"}, index=0)

    def test_shell_requires_argv(self):
        with pytest.raises(RunnerConfigError, match="argv"):
            StepConfig.from_mapping({"command": "shell"}, index=0)

    def test_shell_with_argv(self):
        step = StepConfig.from_mapping({"command": "shell", "argv": ["echo", "hi"]}, index=0)
        assert step.argv == ("echo", "hi")

    def test_argv_only_for_shell(self):
        with pytest.raises(RunnerConfigError, match="shell"):
            StepConfig.from_mapping({"command": "build", "argv": ["x"]}, index=0)

    def test_full_refresh_rejected_for_test(self):
        with pytest.raises(RunnerConfigError, match="full_refresh"):
            StepConfig.from_mapping({"command": "test", "full_refresh": True}, index=0)

    def test_selection_rejected_for_deps(self):
        with pytest.raises(RunnerConfigError, match="selection"):
            StepConfig.from_mapping({"command": "deps", "select": ["x"]}, index=0)

    def test_if_macro_exists_only_for_run_operation(self):
        with pytest.raises(RunnerConfigError, match="if_macro_exists"):
            StepConfig.from_mapping({"command": "build", "if_macro_exists": True}, index=0)

    def test_unknown_command_rejected(self):
        with pytest.raises(RunnerConfigError, match="unsupported"):
            StepConfig.from_mapping({"command": "frobnicate"}, index=2)

    def test_accepts_vars_property(self):
        assert StepConfig.from_mapping({"command": "build"}, index=0).accepts_vars is True
        assert StepConfig.from_mapping({"command": "deps"}, index=0).accepts_vars is False

    def test_exclude_string_shorthand(self):
        step = StepConfig.from_mapping({"command": "build", "exclude": "resource_type:seed"}, index=0)
        assert step.exclude == ("resource_type:seed",)


class TestLoadRunnerConfig:
    def test_from_config_dict_runner_wrapped(self):
        cfg = load_runner_config(config={"runner": runner_payload()})
        assert cfg.project_name == "dbt-example"

    def test_from_config_dict_bare(self):
        cfg = load_runner_config(config=runner_payload())
        assert cfg.project_name == "dbt-example"

    def test_from_yaml(self):
        yaml_str = textwrap.dedent("""
            runner:
              project_name: dbt-y
              project_dir: /tmp/y
              target: local-local
              pipeline:
                - { command: build }
              metrics: { enabled: false }
            """)
        cfg = load_runner_config(config_yaml=yaml_str)
        assert cfg.project_name == "dbt-y"
        assert cfg.metrics.enabled is False

    def test_from_base64(self):
        yaml_str = "runner:\n  project_name: b\n  project_dir: /tmp/b\n  target: t\n  pipeline:\n    - {command: build}\n  metrics: {enabled: false}\n"
        b64 = base64.b64encode(yaml_str.encode()).decode()
        cfg = load_runner_config(config_base64=b64)
        assert cfg.project_name == "b"

    def test_from_path(self, tmp_path):
        path = tmp_path / "runner.yaml"
        path.write_text("runner:\n  project_name: p\n  project_dir: /tmp/p\n  target: t\n  pipeline:\n    - {command: deps}\n  metrics: {enabled: false}\n")
        cfg = load_runner_config(config_path=str(path))
        assert cfg.project_name == "p"

    def test_rejects_zero_sources(self):
        with pytest.raises(RunnerConfigError, match="no configuration supplied"):
            load_runner_config()

    def test_rejects_multiple_sources(self):
        with pytest.raises(RunnerConfigError, match="mutually exclusive"):
            load_runner_config(config=runner_payload(), config_yaml="runner: {}")

    def test_yaml_without_runner_key_rejected(self):
        with pytest.raises(RunnerConfigError, match="runner"):
            load_runner_config(config_yaml="other:\n  x: 1\n")

    def test_missing_file_rejected(self, tmp_path):
        with pytest.raises(RunnerConfigError, match="does not exist"):
            load_runner_config(config_path=str(tmp_path / "nope.yaml"))

    def test_yaml_not_mapping_rejected(self):
        with pytest.raises(RunnerConfigError, match="mapping"):
            load_runner_config(config_yaml="just-a-scalar")


class TestDecodeBase64:
    def test_roundtrip(self):
        assert decode_base64(base64.b64encode(b"hello: world").decode()) == "hello: world"

    def test_invalid_base64_rejected(self):
        with pytest.raises(RunnerConfigError, match="valid base64"):
            decode_base64("!!!not base64!!!")

    def test_empty_rejected(self):
        with pytest.raises(RunnerConfigError, match="non-empty"):
            decode_base64("")


class TestDefaultTemplate:
    def test_template_parses_to_runner_block(self):
        template = load_default_template()
        assert "runner" in template
        assert template["runner"]["project_name"]
