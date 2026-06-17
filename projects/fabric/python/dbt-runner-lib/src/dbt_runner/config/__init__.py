"""Configuration domain: typed models + loading for the inline-YAML contract.

Public symbols are re-exported here so callers and tests import from the stable
``dbt_runner.config`` surface regardless of the internal module split.
"""

from dbt_runner.config.loader import (
    decode_base64,
    load_default_template,
    load_runner_config,
)
from dbt_runner.config.runner import (
    RUNTIME_FABRIC,
    RUNTIME_LOCAL,
    SUPPORTED_RUNTIMES,
    RunnerConfig,
)
from dbt_runner.config.sections import LoggingConfig, MetricsConfig, SessionConfig
from dbt_runner.config.steps import (
    CMD_BUILD,
    CMD_COMPILE,
    CMD_DEBUG,
    CMD_DEPS,
    CMD_DOCS_GENERATE,
    CMD_RUN,
    CMD_RUN_OPERATION,
    CMD_SEED,
    CMD_SHELL,
    CMD_SNAPSHOT,
    CMD_TEST,
    SUPPORTED_COMMANDS,
    StepConfig,
)

__all__ = [
    "RunnerConfig",
    "StepConfig",
    "LoggingConfig",
    "MetricsConfig",
    "SessionConfig",
    "load_runner_config",
    "load_default_template",
    "decode_base64",
    "RUNTIME_LOCAL",
    "RUNTIME_FABRIC",
    "SUPPORTED_RUNTIMES",
    "SUPPORTED_COMMANDS",
    "CMD_DEPS",
    "CMD_DEBUG",
    "CMD_SEED",
    "CMD_RUN",
    "CMD_BUILD",
    "CMD_TEST",
    "CMD_SNAPSHOT",
    "CMD_COMPILE",
    "CMD_DOCS_GENERATE",
    "CMD_RUN_OPERATION",
    "CMD_SHELL",
]
