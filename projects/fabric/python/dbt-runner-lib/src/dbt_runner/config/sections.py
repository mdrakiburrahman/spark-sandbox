"""Sub-section config models: logging, metrics sink, and session lifecycle."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from dbt_runner.config._validation import as_bool, as_str_tuple, require_non_empty_str
from dbt_runner.errors import RunnerConfigError

_DEFAULT_PARTITION_BY = ("project", "event_year_month")
_DEFAULT_FABRIC_ENDPOINT = "https://api.fabric.microsoft.com/v1"


@dataclass(frozen=True)
class LoggingConfig:
    log_path: str | None = None
    archive_previous: bool = True

    @classmethod
    def from_mapping(cls, data: Any) -> LoggingConfig:
        if data is None:
            return cls()
        if not isinstance(data, dict):
            raise RunnerConfigError(f"'logging' must be a mapping, got {type(data).__name__}")
        log_path = data.get("log_path")
        if log_path is not None:
            log_path = require_non_empty_str(log_path, "logging.log_path")
        return cls(log_path=log_path, archive_previous=as_bool(data.get("archive_previous"), "logging.archive_previous", default=True))


@dataclass(frozen=True)
class MetricsConfig:
    enabled: bool = True
    delta_path: str | None = None
    raw_path: str | None = None
    partition_by: tuple[str, ...] = _DEFAULT_PARTITION_BY
    archive_previous_raw: bool = True

    @classmethod
    def from_mapping(cls, data: Any) -> MetricsConfig:
        if data is None:
            return cls(enabled=False)
        if not isinstance(data, dict):
            raise RunnerConfigError(f"'metrics' must be a mapping, got {type(data).__name__}")
        enabled = as_bool(data.get("enabled"), "metrics.enabled", default=True)
        delta_path = data.get("delta_path")
        raw_path = data.get("raw_path")
        if delta_path is not None:
            delta_path = require_non_empty_str(delta_path, "metrics.delta_path")
        if raw_path is not None:
            raw_path = require_non_empty_str(raw_path, "metrics.raw_path")
        partition_by = as_str_tuple(data.get("partition_by"), "metrics.partition_by") or _DEFAULT_PARTITION_BY
        if enabled and not delta_path:
            raise RunnerConfigError("metrics.delta_path is required when metrics.enabled is true")
        return cls(
            enabled=enabled,
            delta_path=delta_path,
            raw_path=raw_path,
            partition_by=partition_by,
            archive_previous_raw=as_bool(data.get("archive_previous_raw"), "metrics.archive_previous_raw", default=True),
        )


@dataclass(frozen=True)
class SessionConfig:
    close: bool = False
    target: str | None = None
    endpoint: str = _DEFAULT_FABRIC_ENDPOINT
    workspace_id: str | None = None
    lakehouse_id: str | None = None

    @classmethod
    def from_mapping(cls, data: Any) -> SessionConfig:
        if data is None:
            return cls()
        if not isinstance(data, dict):
            raise RunnerConfigError(f"'session' must be a mapping, got {type(data).__name__}")
        close = as_bool(data.get("close"), "session.close", default=False)
        target = data.get("target")
        if target is not None:
            target = require_non_empty_str(target, "session.target")
        endpoint = require_non_empty_str(data.get("endpoint") or _DEFAULT_FABRIC_ENDPOINT, "session.endpoint")
        workspace_id = data.get("workspace_id")
        lakehouse_id = data.get("lakehouse_id")
        if workspace_id is not None:
            workspace_id = require_non_empty_str(workspace_id, "session.workspace_id")
        if lakehouse_id is not None:
            lakehouse_id = require_non_empty_str(lakehouse_id, "session.lakehouse_id")
        return cls(close=close, target=target, endpoint=endpoint.rstrip("/"), workspace_id=workspace_id, lakehouse_id=lakehouse_id)
