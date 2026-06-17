"""Assemble the dbt CLI argv for a step (project/profiles/target + flags + vars)."""

from __future__ import annotations

import json

from dbt_runner.config import (
    CMD_DOCS_GENERATE,
    CMD_RUN_OPERATION,
    RunnerConfig,
    StepConfig,
)


class DbtArgsBuilder:
    """Builds the ``dbtRunner.invoke`` argv for a step under a given config."""

    def __init__(self, config: RunnerConfig) -> None:
        self._config = config

    @staticmethod
    def _leading_tokens(step: StepConfig) -> list[str]:
        if step.command == CMD_DOCS_GENERATE:
            return ["docs", "generate"]
        if step.command == CMD_RUN_OPERATION:
            return ["run-operation", step.macro]  # type: ignore[list-item]
        return [step.command]

    def build(self, step: StepConfig) -> list[str]:
        config = self._config
        args = self._leading_tokens(step)
        args += ["--project-dir", config.project_dir, "--profiles-dir", config.profiles_dir, "--target", config.target]

        if step.select:
            args += ["--select", " ".join(step.select)]
        if step.exclude:
            args += ["--exclude", " ".join(step.exclude)]
        if step.full_refresh:
            args += ["--full-refresh"]
        if step.command == CMD_RUN_OPERATION and step.macro_args:
            args += ["--args", json.dumps(step.macro_args)]
        if step.accepts_vars and config.vars:
            args += ["--vars", json.dumps(config.vars)]
        return args


def build_dbt_args(step: StepConfig, config: RunnerConfig) -> list[str]:
    """Functional shim over :meth:`DbtArgsBuilder.build`."""
    return DbtArgsBuilder(config).build(step)
