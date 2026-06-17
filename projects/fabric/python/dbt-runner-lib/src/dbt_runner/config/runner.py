"""The top-level :class:`RunnerConfig` model (composes steps + sections)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, ClassVar

from dbt_runner.config._validation import require_non_empty_str
from dbt_runner.config.sections import LoggingConfig, MetricsConfig, SessionConfig
from dbt_runner.config.steps import StepConfig
from dbt_runner.errors import RunnerConfigError

RUNTIME_LOCAL = "local"
RUNTIME_FABRIC = "fabric"
SUPPORTED_RUNTIMES = (RUNTIME_LOCAL, RUNTIME_FABRIC)


@dataclass(frozen=True)
class RunnerConfig:
    """Top-level configuration parsed from the YAML ``runner:`` block."""

    project_name: str
    project_dir: str
    target: str
    profiles_dir: str
    runtime: str = RUNTIME_LOCAL
    git_root: str | None = None
    vars: dict[str, Any] = field(default_factory=dict)
    pipeline: tuple[StepConfig, ...] = ()
    logging: LoggingConfig = field(default_factory=LoggingConfig)
    metrics: MetricsConfig = field(default_factory=MetricsConfig)
    session: SessionConfig = field(default_factory=SessionConfig)

    _DEFAULT_RESOURCE: ClassVar[str] = "default.yaml"

    @classmethod
    def from_mapping(cls, data: Any) -> RunnerConfig:
        if not isinstance(data, dict):
            raise RunnerConfigError(f"'runner' must be a mapping, got {type(data).__name__}")

        project_name = require_non_empty_str(data.get("project_name"), "runner.project_name")
        project_dir = require_non_empty_str(data.get("project_dir"), "runner.project_dir")
        target = require_non_empty_str(data.get("target"), "runner.target")
        profiles_dir = data.get("profiles_dir")
        profiles_dir = require_non_empty_str(profiles_dir, "runner.profiles_dir") if profiles_dir is not None else project_dir

        runtime = data.get("runtime", RUNTIME_LOCAL)
        if not isinstance(runtime, str) or runtime.strip().lower() not in SUPPORTED_RUNTIMES:
            raise RunnerConfigError(f"runner.runtime {runtime!r} is unsupported; allowed: {', '.join(SUPPORTED_RUNTIMES)}")
        runtime = runtime.strip().lower()

        git_root = data.get("git_root")
        if git_root is not None:
            git_root = require_non_empty_str(git_root, "runner.git_root")

        raw_vars = data.get("vars") or {}
        if not isinstance(raw_vars, dict):
            raise RunnerConfigError(f"runner.vars must be a mapping, got {type(raw_vars).__name__}")

        raw_pipeline = data.get("pipeline")
        if not isinstance(raw_pipeline, (list, tuple)) or not raw_pipeline:
            raise RunnerConfigError("runner.pipeline is required and must be a non-empty list of steps")
        pipeline = tuple(StepConfig.from_mapping(step, index=i) for i, step in enumerate(raw_pipeline))

        metrics = MetricsConfig.from_mapping(data.get("metrics"))
        if any(s.collect_metrics for s in pipeline) and not metrics.enabled:
            raise RunnerConfigError("a pipeline step sets collect_metrics but metrics.enabled is false")

        return cls(
            project_name=project_name,
            project_dir=project_dir,
            target=target,
            profiles_dir=profiles_dir,
            runtime=runtime,
            git_root=git_root,
            vars=dict(raw_vars),
            pipeline=pipeline,
            logging=LoggingConfig.from_mapping(data.get("logging")),
            metrics=metrics,
            session=SessionConfig.from_mapping(data.get("session")),
        )

    @property
    def is_fabric(self) -> bool:
        return self.runtime == RUNTIME_FABRIC
