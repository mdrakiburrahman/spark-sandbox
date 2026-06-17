"""Delta sink for node metrics: resolve the target URI, then append rows.

The OneLake FUSE mount (``/lakehouse/...``) cannot be used by delta-rs: its
commit step needs an atomic rename the FUSE driver rejects ("Operation not
permitted"). So a OneLake FUSE path is rewritten to the abfss object-store
endpoint (committed via ADLS). An ``abfss://`` path is used as-is; any other
(genuinely local) path is written directly with no storage options.
"""

from __future__ import annotations

import os
from typing import Any

import pyarrow as pa

from dbt_runner.config import RunnerConfig
from dbt_runner.errors import MetricsWriteError
from dbt_runner.metrics.schema import PA_SCHEMA
from dbt_runner.runtime import RuntimeProvider

_ONELAKE_FUSE_PREFIX = "/lakehouse/default/Files/"


def resolve_delta_target(delta_path: str, runtime: RuntimeProvider) -> tuple[str, dict[str, str] | None]:
    """Map ``delta_path`` to ``(uri, storage_options)`` for ``write_deltalake``.

    For a local target the parent directory is created eagerly so the first
    Delta commit succeeds.
    """
    if delta_path.startswith("abfss://"):
        return delta_path, runtime.storage_options()

    if delta_path.startswith(_ONELAKE_FUSE_PREFIX):
        workspace_id, lakehouse_id = runtime.onelake_context()
        if not workspace_id or not lakehouse_id:
            raise MetricsWriteError(f"cannot rewrite OneLake FUSE path {delta_path!r} to abfss: workspace/lakehouse id unavailable (is runtime 'fabric'?)")
        rel = delta_path[len(_ONELAKE_FUSE_PREFIX) :]
        uri = f"abfss://{workspace_id}@onelake.dfs.fabric.microsoft.com/{lakehouse_id}/Files/{rel}"
        return uri, runtime.storage_options()

    os.makedirs(os.path.dirname(delta_path) or ".", exist_ok=True)
    return delta_path, None


class DeltaMetricsSink:
    """Appends ``PA_SCHEMA``-shaped rows to the configured metrics Delta table."""

    def __init__(self, config: RunnerConfig) -> None:
        self._config = config

    def write(self, rows: list[dict[str, Any]], runtime: RuntimeProvider) -> tuple[int, str]:
        """Append ``rows`` and return ``(row_count, resolved_uri)``.

        Raises :class:`MetricsWriteError` on any hard write failure.
        """
        delta_path = self._config.metrics.delta_path
        if not delta_path:
            raise MetricsWriteError("metrics.delta_path is not set but metrics were collected")
        try:
            from deltalake import write_deltalake

            uri, storage_options = resolve_delta_target(delta_path, runtime)
            table = pa.Table.from_pylist(rows, schema=PA_SCHEMA)
            kwargs: dict[str, Any] = {"mode": "append", "partition_by": list(self._config.metrics.partition_by)}
            if storage_options is not None:
                kwargs["storage_options"] = storage_options
            write_deltalake(uri, table, **kwargs)
            return len(rows), uri
        except MetricsWriteError:
            raise
        except Exception as exc:
            raise MetricsWriteError(f"[{self._config.project_name}] metrics delta flush failed: {exc}") from exc
