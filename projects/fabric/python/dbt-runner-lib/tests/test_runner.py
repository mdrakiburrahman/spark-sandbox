"""Tests for `dbt_runner.runner` — end-to-end orchestration with mocked dbt."""

from __future__ import annotations

import pytest

from _helpers import fake_invoke_result, fake_node_result, runner_payload
from dbt_runner.config import RunnerConfig
from dbt_runner.errors import DbtStepError
from dbt_runner.runner import DbtRunner


class _Local:
    is_fabric = False

    def get_token(self, audience):
        raise AssertionError("no token locally")

    def storage_options(self):
        return None

    def onelake_context(self):
        return None, None


def _make_config(tmp_path, **overrides):
    project_dir = tmp_path / "project"
    (project_dir / "target").mkdir(parents=True)
    (project_dir / "target" / "run_results.json").write_text('{"results": []}')
    base = runner_payload(
        project_dir=str(project_dir),
        pipeline=[
            {"command": "deps"},
            {"command": "seed", "collect_metrics": True, "copy_run_results": True},
            {"command": "build", "exclude": ["resource_type:seed"], "collect_metrics": True, "copy_run_results": True},
        ],
        metrics={"enabled": True, "delta_path": str(tmp_path / "delta" / "dbt_node_executions"), "raw_path": str(tmp_path / "raw")},
    )
    base.update(overrides)
    return RunnerConfig.from_mapping(base)


def _invoker_with_nodes():
    def fake_invoke(args):
        command = args[0]
        if command in ("seed", "build"):
            return fake_invoke_result(success=True, node_results=[fake_node_result()])
        return fake_invoke_result(success=True, node_results=None)

    return fake_invoke


class TestRunSuccess:
    def test_full_pipeline_writes_metrics_and_copies_run_results(self, tmp_path):
        from deltalake import DeltaTable

        cfg = _make_config(tmp_path)
        runner = DbtRunner(cfg, dbt_invoke=_invoker_with_nodes(), runtime=_Local())
        report = runner.run()

        assert report.success is True
        assert [o.command for o in report.outcomes] == ["deps", "seed", "build"]
        # seed + build each contributed one node row.
        assert report.metric_rows_written == 2

        dt = DeltaTable(str(tmp_path / "delta" / "dbt_node_executions"))
        assert dt.to_pyarrow_table().num_rows == 2

        # run_results copied per metric-bearing command.
        assert (tmp_path / "raw" / "run_results-seed.json").is_file()
        assert (tmp_path / "raw" / "run_results-build.json").is_file()

    def test_only_filter_runs_subset(self, tmp_path):
        cfg = _make_config(tmp_path)
        runner = DbtRunner(cfg, dbt_invoke=_invoker_with_nodes(), runtime=_Local())
        report = runner.run(only=["build"])
        assert [o.command for o in report.outcomes] == ["build"]
        assert report.metric_rows_written == 1

    def test_run_operation_skipped_when_macro_absent(self, tmp_path):
        cfg = _make_config(
            tmp_path,
            pipeline=[
                {"command": "deps"},
                {"command": "run-operation", "macro": "cleanup_dbt_tmp_relations", "if_macro_exists": True},
            ],
            metrics={"enabled": False},
        )
        runner = DbtRunner(cfg, dbt_invoke=_invoker_with_nodes(), runtime=_Local())
        report = runner.run()
        op = next(o for o in report.outcomes if o.command == "run-operation")
        assert op.skipped is True


class TestRunFailure:
    def test_failing_step_raises_dbt_step_error(self, tmp_path):
        cfg = _make_config(tmp_path)

        def fake_invoke(args):
            if args[0] == "build":
                return fake_invoke_result(success=False, exception=RuntimeError("explode"))
            if args[0] == "seed":
                return fake_invoke_result(success=True, node_results=[fake_node_result()])
            return fake_invoke_result(success=True)

        runner = DbtRunner(cfg, dbt_invoke=fake_invoke, runtime=_Local())
        with pytest.raises(DbtStepError, match="build failed"):
            runner.run()

    def test_partial_metrics_survive_failure(self, tmp_path):
        from deltalake import DeltaTable

        cfg = _make_config(tmp_path)

        def fake_invoke(args):
            if args[0] == "build":
                return fake_invoke_result(success=False, exception=RuntimeError("explode"))
            if args[0] == "seed":
                return fake_invoke_result(success=True, node_results=[fake_node_result()])
            return fake_invoke_result(success=True)

        runner = DbtRunner(cfg, dbt_invoke=fake_invoke, runtime=_Local())
        with pytest.raises(DbtStepError):
            runner.run()
        # seed's metric row was still flushed in the finally phase.
        dt = DeltaTable(str(tmp_path / "delta" / "dbt_node_executions"))
        assert dt.to_pyarrow_table().num_rows == 1


class TestConstructors:
    def test_rejects_non_config(self):
        with pytest.raises(Exception):
            DbtRunner({"not": "a config"})  # type: ignore[arg-type]

    def test_from_mapping_roundtrip(self, tmp_path):
        cfg_payload = runner_payload(metrics={"enabled": False}, pipeline=[{"command": "deps"}])
        runner = DbtRunner.from_mapping(cfg_payload, dbt_invoke=lambda args: fake_invoke_result(success=True), runtime=_Local())
        assert runner.validate().project_name == "dbt-example"
        report = runner.run()
        assert report.success is True
