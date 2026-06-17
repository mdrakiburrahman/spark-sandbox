"""Tests for `dbt_runner.pipeline`."""

from __future__ import annotations

from types import SimpleNamespace

from _helpers import fake_invoke_result, runner_payload
from dbt_runner.config import RunnerConfig, StepConfig
from dbt_runner.pipeline import DbtPipeline, build_dbt_args, macro_exists
from dbt_runner.pipeline.args import DbtArgsBuilder
from dbt_runner.pipeline.macros import MacroResolver


def _cfg(**overrides):
    return RunnerConfig.from_mapping(runner_payload(**overrides))


class TestBuildDbtArgs:
    def test_deps_minimal(self):
        cfg = _cfg()
        args = build_dbt_args(StepConfig.from_mapping({"command": "deps"}, index=0), cfg)
        assert args == ["deps", "--project-dir", cfg.project_dir, "--profiles-dir", cfg.profiles_dir, "--target", "local-local"]

    def test_build_with_exclude_and_full_refresh(self):
        cfg = _cfg()
        step = StepConfig.from_mapping({"command": "build", "exclude": ["resource_type:seed"], "full_refresh": True}, index=0)
        args = build_dbt_args(step, cfg)
        assert "--exclude" in args and "resource_type:seed" in args
        assert "--full-refresh" in args

    def test_vars_injected_when_present(self):
        cfg = _cfg(vars={"region_filter": ["*"]})
        args = build_dbt_args(StepConfig.from_mapping({"command": "build"}, index=0), cfg)
        assert "--vars" in args
        assert args[args.index("--vars") + 1] == '{"region_filter": ["*"]}'

    def test_vars_not_injected_when_empty(self):
        cfg = _cfg()
        args = build_dbt_args(StepConfig.from_mapping({"command": "build"}, index=0), cfg)
        assert "--vars" not in args

    def test_vars_not_injected_for_deps(self):
        cfg = _cfg(vars={"x": 1})
        args = build_dbt_args(StepConfig.from_mapping({"command": "deps"}, index=0), cfg)
        assert "--vars" not in args

    def test_docs_generate_maps_to_two_tokens(self):
        cfg = _cfg()
        args = build_dbt_args(StepConfig.from_mapping({"command": "docs-generate"}, index=0), cfg)
        assert args[:2] == ["docs", "generate"]

    def test_run_operation_includes_macro_and_args(self):
        cfg = _cfg()
        step = StepConfig.from_mapping({"command": "run-operation", "macro": "my_macro", "macro_args": {"k": "v"}}, index=0)
        args = build_dbt_args(step, cfg)
        assert args[:2] == ["run-operation", "my_macro"]
        assert "--args" in args
        assert args[args.index("--args") + 1] == '{"k": "v"}'

    def test_select_joined(self):
        cfg = _cfg()
        step = StepConfig.from_mapping({"command": "build", "select": ["dim_customer+", "fct_sales"]}, index=0)
        args = build_dbt_args(step, cfg)
        assert args[args.index("--select") + 1] == "dim_customer+ fct_sales"


class TestMacroExists:
    def test_finds_macro(self, tmp_path):
        macros = tmp_path / "macros"
        macros.mkdir()
        (macros / "cleanup.sql").write_text("{% macro cleanup_dbt_tmp_relations() %}{% endmacro %}")
        assert macro_exists(str(tmp_path), "cleanup_dbt_tmp_relations") is True

    def test_absent_macro(self, tmp_path):
        (tmp_path / "macros").mkdir()
        assert macro_exists(str(tmp_path), "cleanup_dbt_tmp_relations") is False

    def test_no_macros_dir(self, tmp_path):
        assert macro_exists(str(tmp_path), "anything") is False


class TestArgsBuilderAndMacroResolverClasses:
    def test_args_builder_build(self):
        cfg = _cfg(vars={"region_filter": ["*"]})
        args = DbtArgsBuilder(cfg).build(StepConfig.from_mapping({"command": "build"}, index=0))
        assert args[0] == "build"
        assert "--vars" in args
        # The functional shim delegates to the class — identical output.
        assert args == build_dbt_args(StepConfig.from_mapping({"command": "build"}, index=0), cfg)

    def test_macro_resolver_exists(self, tmp_path):
        (tmp_path / "macros").mkdir()
        (tmp_path / "macros" / "m.sql").write_text("{% macro foo() %}{% endmacro %}")
        resolver = MacroResolver(str(tmp_path))
        assert resolver.exists("foo") is True
        assert resolver.exists("bar") is False


class TestDbtPipelineInvoke:
    def test_dbt_step_success(self):
        captured = {}

        def fake_invoke(args):
            captured["args"] = args
            return fake_invoke_result(success=True)

        pipe = DbtPipeline(_cfg(), dbt_invoke=fake_invoke)
        outcome = pipe.invoke(StepConfig.from_mapping({"command": "deps"}, index=0))
        assert outcome.success is True
        assert outcome.command == "deps"
        assert captured["args"][0] == "deps"

    def test_dbt_step_failure_detail(self):
        def fake_invoke(args):
            return fake_invoke_result(success=False, exception=RuntimeError("boom"))

        pipe = DbtPipeline(_cfg(), dbt_invoke=fake_invoke)
        outcome = pipe.invoke(StepConfig.from_mapping({"command": "build"}, index=0))
        assert outcome.success is False
        assert "boom" in outcome.detail

    def test_run_operation_skipped_when_macro_missing(self, tmp_path):
        cfg = _cfg(project_dir=str(tmp_path))
        called = {"n": 0}

        def fake_invoke(args):
            called["n"] += 1
            return fake_invoke_result(success=True)

        pipe = DbtPipeline(cfg, dbt_invoke=fake_invoke)
        step = StepConfig.from_mapping({"command": "run-operation", "macro": "cleanup", "if_macro_exists": True}, index=0)
        outcome = pipe.invoke(step)
        assert outcome.skipped is True
        assert outcome.success is True
        assert called["n"] == 0  # dbt never invoked

    def test_run_operation_runs_when_macro_present(self, tmp_path):
        macros = tmp_path / "macros"
        macros.mkdir()
        (macros / "c.sql").write_text("{% macro cleanup() %}{% endmacro %}")
        cfg = _cfg(project_dir=str(tmp_path))
        pipe = DbtPipeline(cfg, dbt_invoke=lambda args: fake_invoke_result(success=True))
        step = StepConfig.from_mapping({"command": "run-operation", "macro": "cleanup", "if_macro_exists": True}, index=0)
        outcome = pipe.invoke(step)
        assert outcome.skipped is False
        assert outcome.success is True

    def test_shell_step_success(self):
        captured = {}

        def fake_shell(argv, cwd):
            captured["argv"] = argv
            captured["cwd"] = cwd
            return SimpleNamespace(returncode=0)

        cfg = _cfg()
        pipe = DbtPipeline(cfg, shell_invoke=fake_shell)
        outcome = pipe.invoke(StepConfig.from_mapping({"command": "shell", "argv": ["echo", "hi"]}, index=0))
        assert outcome.success is True
        assert captured == {"argv": ["echo", "hi"], "cwd": cfg.project_dir}

    def test_shell_step_failure(self):
        pipe = DbtPipeline(_cfg(), shell_invoke=lambda argv, cwd: SimpleNamespace(returncode=2))
        outcome = pipe.invoke(StepConfig.from_mapping({"command": "shell", "argv": ["false"]}, index=0))
        assert outcome.success is False
        assert "exit code: 2" in outcome.detail
