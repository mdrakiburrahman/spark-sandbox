"""dbt-runner-lib — one config-driven dbt execution runner for local + Fabric.

Hand it a base64 inline-YAML config and call ``run``::

    from dbt_runner import DbtRunner
    DbtRunner.from_base64(b64_yaml).run()
"""

from dbt_runner.config import (
    LoggingConfig,
    MetricsConfig,
    RunnerConfig,
    SessionConfig,
    StepConfig,
    decode_base64,
    load_default_template,
    load_runner_config,
)
from dbt_runner.errors import (
    DbtRunnerError,
    DbtStepError,
    FabricRuntimeUnavailableError,
    MetricsWriteError,
    RunnerConfigError,
)
from dbt_runner.runner import DbtRunner, RunReport

__all__ = [
    "DbtRunner",
    "RunReport",
    "RunnerConfig",
    "StepConfig",
    "MetricsConfig",
    "LoggingConfig",
    "SessionConfig",
    "load_runner_config",
    "load_default_template",
    "decode_base64",
    "DbtRunnerError",
    "RunnerConfigError",
    "DbtStepError",
    "MetricsWriteError",
    "FabricRuntimeUnavailableError",
]
__version__ = "0.1.0"
