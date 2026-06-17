"""Factory: build the :class:`RuntimeProvider` selected by ``runner.runtime``."""

from __future__ import annotations

from dbt_runner.config import RunnerConfig
from dbt_runner.runtime.base import RuntimeProvider
from dbt_runner.runtime.fabric import FabricRuntime
from dbt_runner.runtime.local import LocalRuntime


def make_runtime(config: RunnerConfig) -> RuntimeProvider:
    return FabricRuntime() if config.is_fabric else LocalRuntime()
