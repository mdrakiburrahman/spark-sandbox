"""Typed errors raised by `dbt-runner-lib`.

The hierarchy is intentionally small and predictable so callers (the local
wrapper, the Fabric notebook, and unit tests) can distinguish a bad *config*
from a failed *dbt step* from a metrics-sink problem.
"""

from __future__ import annotations


class DbtRunnerError(Exception):
    """Base class for every error raised by this library."""


class RunnerConfigError(DbtRunnerError, ValueError):
    """Raised when the inline-YAML configuration is missing, malformed, or violates a constraint."""


class DbtStepError(DbtRunnerError, RuntimeError):
    """Raised when a dbt pipeline step (deps/seed/build/...) reports failure."""


class MetricsWriteError(DbtRunnerError, RuntimeError):
    """Raised when flushing collected node metrics to the Delta sink fails."""


class FabricRuntimeUnavailableError(DbtRunnerError, RuntimeError):
    """Raised when a Fabric-only feature is used outside the Fabric notebook runtime.

    ``notebookutils`` ships only with the Fabric Spark / Python notebook
    runtime and is not pip-installable, so any code path that needs it (storage
    tokens for an abfss Delta sink, Livy session close) raises this when run on
    a plain devbox.
    """
