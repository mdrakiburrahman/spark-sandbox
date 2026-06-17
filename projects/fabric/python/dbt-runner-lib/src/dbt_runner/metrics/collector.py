"""Buffers normalized node metrics across pipeline steps, flushes once at the end."""

from __future__ import annotations

import os
import shutil
from datetime import datetime, timezone
from typing import Any

from dbt_runner.config import RunnerConfig
from dbt_runner.metrics.delta_sink import DeltaMetricsSink
from dbt_runner.metrics.normalize import (
    normalize_node_result,
    resolve_dbt_version,
    resolve_invocation_id,
)
from dbt_runner.runtime import RuntimeProvider


class MetricsCollector:
    """Accumulates node-execution rows + archives ``run_results.json`` per command."""

    def __init__(self, config: RunnerConfig) -> None:
        self._config = config
        self._buffer: list[dict[str, Any]] = []
        self._dbt_version = resolve_dbt_version()
        self._invocation_started_at = datetime.now(timezone.utc).replace(tzinfo=None)
        self._sink = DeltaMetricsSink(config)

    @property
    def buffer(self) -> list[dict[str, Any]]:
        return self._buffer

    def collect(self, command: str, result: Any) -> None:
        """Append normalized node rows from a dbtRunner result. Never raises.

        deps/debug have no node results (no-op); per-node errors are printed.
        """
        project = self._config.project_name
        try:
            run_result = getattr(result, "result", None)
            results = getattr(run_result, "results", None)
            if not results:
                return
            generated_at = getattr(run_result, "generated_at", None)
            invocation = resolve_invocation_id()
            for r in results:
                try:
                    self._buffer.append(
                        normalize_node_result(
                            project,
                            command,
                            r,
                            generated_at,
                            invocation,
                            dbt_version=self._dbt_version,
                            invocation_started_at=self._invocation_started_at,
                        )
                    )
                except Exception as exc:
                    print(f"[{project}] metrics normalize ({command}) failed for one node: {exc}")
        except Exception as exc:
            print(f"[{project}] metrics collect ({command}) failed: {exc}")

    def archive_previous_raw(self, commands: list[str]) -> None:
        """Rename any prior ``run_results-<command>.json`` so a fresh copy can land. Never raises."""
        raw_path = self._config.metrics.raw_path
        if not raw_path or not self._config.metrics.archive_previous_raw:
            return
        for command in commands:
            try:
                current = os.path.join(raw_path, f"run_results-{command}.json")
                if os.path.exists(current):
                    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
                    archived = os.path.join(raw_path, f"run_results-{command}-archived-at-{ts}.json")
                    os.rename(current, archived)
                    print(f"Archived previous run_results-{command}.json to {archived}")
            except Exception as exc:
                print(f"Warning: failed to archive previous run_results-{command}.json: {exc}")

    def copy_run_results(self, command: str) -> None:
        """Copy dbt's ``run_results.json`` verbatim before the next command overwrites it. Never raises."""
        raw_path = self._config.metrics.raw_path
        if not raw_path:
            return
        project = self._config.project_name
        try:
            src = os.path.join(self._config.project_dir, "target", "run_results.json")
            if not os.path.exists(src):
                return
            os.makedirs(raw_path, exist_ok=True)
            dst = os.path.join(raw_path, f"run_results-{command}.json")
            shutil.copyfile(src, dst)
            try:
                with open(dst, "a") as handle:
                    os.fsync(handle.fileno())
            except OSError:
                pass
            print(f"[{project}] archived run_results.json -> {dst}")
        except Exception as exc:
            print(f"[{project}] raw run_results copy ({command}) failed: {exc}")

    def flush_to_delta(self, runtime: RuntimeProvider) -> int:
        """Single append of the buffered node metrics to the Delta table.

        Called once (in the cleanup phase) so partial results survive a mid-run
        failure. Returns the number of rows written (0 when nothing buffered).
        Raises :class:`~dbt_runner.errors.MetricsWriteError` on a hard failure.
        """
        project = self._config.project_name
        if not self._config.metrics.enabled:
            return 0
        if not self._buffer:
            print(f"[{project}] no node metrics to write")
            return 0
        written, uri = self._sink.write(self._buffer, runtime)
        print(f"[{project}] wrote {written} node metric rows to {uri}")
        return written
