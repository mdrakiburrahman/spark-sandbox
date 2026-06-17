"""`DbtRunner` — the single entry point.

Decodes one inline-YAML config, validates it, and runs the declared pipeline:
per-step dbt invocation → log flush → metric collection → run_results archival,
then a single metrics flush to Delta and an optional Livy session close.

Usage::

    from dbt_runner import DbtRunner
    DbtRunner.from_base64(b64_yaml).run()
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from dbt_runner.config import RunnerConfig, StepConfig, load_runner_config
from dbt_runner.errors import DbtStepError, MetricsWriteError, RunnerConfigError
from dbt_runner.logs import LogManager
from dbt_runner.metrics import MetricsCollector
from dbt_runner.pipeline import DbtInvoke, DbtPipeline, ShellInvoke, StepOutcome
from dbt_runner.runtime import RuntimeProvider, make_runtime
from dbt_runner.session import HttpDelete, SessionCloser


@dataclass
class RunReport:
    """Outcome of a :meth:`DbtRunner.run` call."""

    project_name: str
    outcomes: list[StepOutcome] = field(default_factory=list)
    metric_rows_written: int = 0

    @property
    def success(self) -> bool:
        return all(o.success for o in self.outcomes)


class DbtRunner:
    """Config-driven dbt execution engine. Test doubles are injectable by keyword."""

    def __init__(
        self,
        config: RunnerConfig,
        *,
        dbt_invoke: DbtInvoke | None = None,
        shell_invoke: ShellInvoke | None = None,
        http_delete: HttpDelete | None = None,
        runtime: RuntimeProvider | None = None,
    ) -> None:
        if not isinstance(config, RunnerConfig):
            raise RunnerConfigError(f"DbtRunner requires a RunnerConfig, got {type(config).__name__}")
        self._config = config
        self._dbt_invoke = dbt_invoke
        self._shell_invoke = shell_invoke
        self._http_delete = http_delete
        self._runtime_override = runtime

    # --- Constructors ---------------------------------------------------------

    @classmethod
    def from_base64(cls, config_base64: str, **kwargs: Any) -> DbtRunner:
        return cls(load_runner_config(config_base64=config_base64), **kwargs)

    @classmethod
    def from_yaml(cls, config_yaml: str, **kwargs: Any) -> DbtRunner:
        return cls(load_runner_config(config_yaml=config_yaml), **kwargs)

    @classmethod
    def from_path(cls, config_path: str | Path, **kwargs: Any) -> DbtRunner:
        return cls(load_runner_config(config_path=config_path), **kwargs)

    @classmethod
    def from_mapping(cls, config: dict[str, Any], **kwargs: Any) -> DbtRunner:
        return cls(load_runner_config(config=config), **kwargs)

    # --- Public API -----------------------------------------------------------

    @property
    def config(self) -> RunnerConfig:
        return self._config

    def validate(self) -> RunnerConfig:
        """Return the validated config (validation already ran at construction)."""
        return self._config

    def run(self, only: list[str] | None = None) -> RunReport:
        """Execute the configured pipeline and return a :class:`RunReport`.

        Metrics are flushed and the session closed in a ``finally``-like phase so
        partial results survive a mid-run failure. A dbt step failure takes
        precedence over a metrics-sink failure when both occur.
        """
        config = self._config
        self._prepare_environment()
        logs = LogManager(config)
        logs.prepare()

        runtime = self._runtime_override or make_runtime(config)
        pipeline = DbtPipeline(config, dbt_invoke=self._dbt_invoke, shell_invoke=self._shell_invoke)
        collector = MetricsCollector(config)
        closer = SessionCloser(config, runtime, http_delete=self._http_delete)

        steps = self._select_steps(only)
        collector.archive_previous_raw([s.command for s in steps if s.copy_run_results])

        report = RunReport(project_name=config.project_name)
        primary_exc: BaseException | None = None

        try:
            for step in steps:
                outcome = pipeline.invoke(step)
                logs.flush()
                if step.collect_metrics and outcome.dbt_result is not None:
                    collector.collect(step.command, outcome.dbt_result)
                if step.copy_run_results:
                    collector.copy_run_results(step.command)
                report.outcomes.append(outcome)
                status = "success" if outcome.success else "FAILED"
                suffix = " (skipped)" if outcome.skipped else ""
                print(f"[{config.project_name}] {outcome.command}: {status}{suffix}")
                if not outcome.success:
                    raise DbtStepError(f"[{config.project_name}] {outcome.command} failed{outcome.detail}")
        except BaseException as exc:  # noqa: BLE001 — re-raised below after cleanup
            primary_exc = exc

        flush_error: MetricsWriteError | None = None
        try:
            report.metric_rows_written = collector.flush_to_delta(runtime)
        except MetricsWriteError as exc:
            flush_error = exc
            print(f"[{config.project_name}] {exc}")
        closer.close()

        if primary_exc is not None:
            raise primary_exc
        if flush_error is not None:
            raise flush_error
        return report

    # --- Internals ------------------------------------------------------------

    def _prepare_environment(self) -> None:
        if self._config.git_root:
            os.environ["GIT_ROOT"] = self._config.git_root
        os.environ["DBT_PROFILES_DIR"] = self._config.profiles_dir

    def _select_steps(self, only: list[str] | None) -> list[StepConfig]:
        if only is None:
            return list(self._config.pipeline)
        wanted = set(only)
        return [s for s in self._config.pipeline if s.command in wanted]
