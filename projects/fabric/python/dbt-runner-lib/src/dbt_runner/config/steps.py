"""Pipeline command vocabulary + the per-step :class:`StepConfig` model."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from dbt_runner.config._validation import as_bool, as_str_tuple, require_non_empty_str
from dbt_runner.errors import RunnerConfigError

# --- Pipeline commands --------------------------------------------------------

CMD_DEPS = "deps"
CMD_DEBUG = "debug"
CMD_SEED = "seed"
CMD_RUN = "run"
CMD_BUILD = "build"
CMD_TEST = "test"
CMD_SNAPSHOT = "snapshot"
CMD_COMPILE = "compile"
CMD_DOCS_GENERATE = "docs-generate"
CMD_RUN_OPERATION = "run-operation"
CMD_SHELL = "shell"

SUPPORTED_COMMANDS = (
    CMD_DEPS,
    CMD_DEBUG,
    CMD_SEED,
    CMD_RUN,
    CMD_BUILD,
    CMD_TEST,
    CMD_SNAPSHOT,
    CMD_COMPILE,
    CMD_DOCS_GENERATE,
    CMD_RUN_OPERATION,
    CMD_SHELL,
)

# Commands that accept dbt node selection (`--exclude` / `--select`).
SELECTION_COMMANDS = frozenset({CMD_SEED, CMD_RUN, CMD_BUILD, CMD_TEST, CMD_SNAPSHOT, CMD_COMPILE})
# Commands that accept `--full-refresh`.
FULL_REFRESH_COMMANDS = frozenset({CMD_SEED, CMD_RUN, CMD_BUILD, CMD_SNAPSHOT})
# Commands that accept `--vars`.
VARS_COMMANDS = frozenset({CMD_SEED, CMD_RUN, CMD_BUILD, CMD_TEST, CMD_SNAPSHOT, CMD_COMPILE, CMD_RUN_OPERATION})


@dataclass(frozen=True)
class StepConfig:
    """One ordered pipeline step: a dbt command, a run-operation, or a shell hook."""

    command: str
    full_refresh: bool = False
    exclude: tuple[str, ...] = ()
    select: tuple[str, ...] = ()
    collect_metrics: bool = False
    copy_run_results: bool = False
    macro: str | None = None
    macro_args: dict[str, Any] | None = None
    if_macro_exists: bool = False
    argv: tuple[str, ...] = ()

    @classmethod
    def from_mapping(cls, data: Any, *, index: int) -> StepConfig:
        where = f"pipeline[{index}]"
        if not isinstance(data, dict):
            raise RunnerConfigError(f"{where} must be a mapping, got {type(data).__name__}")
        if "command" not in data:
            raise RunnerConfigError(f"{where} requires a 'command'")
        command = data["command"]
        if not isinstance(command, str) or command not in SUPPORTED_COMMANDS:
            raise RunnerConfigError(f"{where}.command {command!r} is unsupported; allowed: {', '.join(SUPPORTED_COMMANDS)}")

        full_refresh = as_bool(data.get("full_refresh"), f"{where}.full_refresh", default=False)
        exclude = as_str_tuple(data.get("exclude"), f"{where}.exclude")
        select = as_str_tuple(data.get("select"), f"{where}.select")
        collect_metrics = as_bool(data.get("collect_metrics"), f"{where}.collect_metrics", default=False)
        copy_run_results = as_bool(data.get("copy_run_results"), f"{where}.copy_run_results", default=False)
        if_macro_exists = as_bool(data.get("if_macro_exists"), f"{where}.if_macro_exists", default=False)

        macro: str | None = None
        macro_args: dict[str, Any] | None = None
        argv: tuple[str, ...] = ()

        if command == CMD_RUN_OPERATION:
            macro = require_non_empty_str(data.get("macro"), f"{where}.macro")
            raw_args = data.get("macro_args")
            if raw_args is not None:
                if not isinstance(raw_args, dict):
                    raise RunnerConfigError(f"{where}.macro_args must be a mapping, got {type(raw_args).__name__}")
                macro_args = dict(raw_args)
        elif "macro" in data:
            raise RunnerConfigError(f"{where}.macro is only valid for command 'run-operation'")

        if command == CMD_SHELL:
            argv = as_str_tuple(data.get("argv"), f"{where}.argv")
            if not argv:
                raise RunnerConfigError(f"{where}.argv must be a non-empty list for command 'shell'")
        elif "argv" in data:
            raise RunnerConfigError(f"{where}.argv is only valid for command 'shell'")

        if full_refresh and command not in FULL_REFRESH_COMMANDS:
            raise RunnerConfigError(f"{where}.full_refresh is not valid for command {command!r}")
        if (exclude or select) and command not in SELECTION_COMMANDS:
            raise RunnerConfigError(f"{where} selection (exclude/select) is not valid for command {command!r}")
        if if_macro_exists and command != CMD_RUN_OPERATION:
            raise RunnerConfigError(f"{where}.if_macro_exists is only valid for command 'run-operation'")

        return cls(
            command=command,
            full_refresh=full_refresh,
            exclude=exclude,
            select=select,
            collect_metrics=collect_metrics,
            copy_run_results=copy_run_results,
            macro=macro,
            macro_args=macro_args,
            if_macro_exists=if_macro_exists,
            argv=argv,
        )

    @property
    def accepts_vars(self) -> bool:
        return self.command in VARS_COMMANDS
