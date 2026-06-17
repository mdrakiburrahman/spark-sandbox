"""Executes pipeline steps via the in-process ``dbtRunner`` API + shell hooks.

``dbtRunner`` is imported lazily and the invoke callables are injectable, so unit
tests exercise control flow without dbt installed.
"""

from __future__ import annotations

import subprocess
from typing import Any, Callable

from dbt_runner.config import CMD_RUN_OPERATION, CMD_SHELL, RunnerConfig, StepConfig
from dbt_runner.pipeline.args import DbtArgsBuilder
from dbt_runner.pipeline.macros import MacroResolver
from dbt_runner.pipeline.outcome import StepOutcome

# A dbt invocation: takes the assembled argv, returns a dbtRunner result object.
DbtInvoke = Callable[[list[str]], Any]
# A shell invocation: takes argv + cwd, returns a completed-process-like object.
ShellInvoke = Callable[[list[str], str], Any]


def _default_dbt_invoke(args: list[str]) -> Any:
    from dbt.cli.main import dbtRunner

    return dbtRunner().invoke(args)


def _default_shell_invoke(argv: list[str], cwd: str) -> Any:
    return subprocess.run(argv, cwd=cwd, check=False)


class DbtPipeline:
    """Runs steps; the dbt/shell invokers are injectable for tests."""

    def __init__(
        self,
        config: RunnerConfig,
        *,
        dbt_invoke: DbtInvoke | None = None,
        shell_invoke: ShellInvoke | None = None,
    ) -> None:
        self._config = config
        self._args = DbtArgsBuilder(config)
        self._macros = MacroResolver(config.project_dir)
        self._dbt_invoke = dbt_invoke or _default_dbt_invoke
        self._shell_invoke = shell_invoke or _default_shell_invoke

    def invoke(self, step: StepConfig) -> StepOutcome:
        if step.command == CMD_SHELL:
            return self._invoke_shell(step)
        if step.command == CMD_RUN_OPERATION and step.if_macro_exists and not self._macros.exists(step.macro or ""):
            print(f"[{self._config.project_name}] run-operation {step.macro}: skipped (macro not found)")
            return StepOutcome(command=step.command, success=True, skipped=True)
        return self._invoke_dbt(step)

    def _invoke_dbt(self, step: StepConfig) -> StepOutcome:
        result = self._dbt_invoke(self._args.build(step))
        success = bool(getattr(result, "success", False))
        detail = ""
        if not success:
            exception = getattr(result, "exception", None)
            if exception:
                detail += f"\n  Exception: {exception}"
            inner = getattr(result, "result", None)
            if inner:
                detail += f"\n  Result: {inner}"
        return StepOutcome(command=step.command, success=success, dbt_result=result, detail=detail)

    def _invoke_shell(self, step: StepConfig) -> StepOutcome:
        completed = self._shell_invoke(list(step.argv), self._config.project_dir)
        returncode = getattr(completed, "returncode", 1)
        success = returncode == 0
        detail = "" if success else f"\n  shell exit code: {returncode}"
        return StepOutcome(command=step.command, success=success, detail=detail)
