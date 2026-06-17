"""Logging domain: dbt log archival + FUSE-safe flush."""

from dbt_runner.config import RunnerConfig
from dbt_runner.logs.manager import LogManager


def prepare_log_path(config: RunnerConfig) -> str | None:
    """Functional shim over :meth:`LogManager.prepare`."""
    return LogManager(config).prepare()


def flush_dbt_logs(dbt_log_file: str | None) -> None:
    """Functional shim over :meth:`LogManager.flush_file`."""
    LogManager.flush_file(dbt_log_file)


__all__ = ["LogManager", "prepare_log_path", "flush_dbt_logs"]
