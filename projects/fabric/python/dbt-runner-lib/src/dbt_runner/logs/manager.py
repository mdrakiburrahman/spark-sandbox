"""dbt log-file lifecycle: archive the previous log, then flush + fsync.

On a FUSE filesystem (OneLake) dbt's ``cleanup_event_logger`` clears the loggers
without flushing, so the ``RotatingFileHandler``'s buffered writes may never
reach the backing store. :meth:`LogManager.flush` forces a flush + fsync so logs
survive even a mid-run crash. The same path is harmless locally.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

from dbt_runner.config import RunnerConfig


class LogManager:
    """Owns the configured ``DBT_LOG_PATH`` and the run's ``dbt.log`` file."""

    def __init__(self, config: RunnerConfig) -> None:
        self._config = config
        self._dbt_log_file: str | None = None

    @property
    def dbt_log_file(self) -> str | None:
        return self._dbt_log_file

    def prepare(self) -> str | None:
        """Create the configured log path, archive any previous ``dbt.log``.

        Returns the absolute ``dbt.log`` path (or ``None`` when no log path is
        configured) and exports ``DBT_LOG_PATH`` so dbt writes there.
        """
        log_path = self._config.logging.log_path
        if not log_path:
            self._dbt_log_file = None
            return None

        os.environ["DBT_LOG_PATH"] = log_path
        os.makedirs(log_path, exist_ok=True)

        dbt_log_file = os.path.join(log_path, "dbt.log")
        if self._config.logging.archive_previous and os.path.exists(dbt_log_file):
            ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            archived = os.path.join(log_path, f"dbt-archived-at-{ts}.log")
            try:
                os.rename(dbt_log_file, archived)
                print(f"Archived previous dbt.log to {archived}")
            except OSError as exc:
                print(f"Warning: failed to archive previous dbt.log: {exc}")
        self._dbt_log_file = dbt_log_file
        return dbt_log_file

    def flush(self) -> None:
        """Flush dbt's file logger and fsync it to persistent storage. Never raises."""
        self.flush_file(self._dbt_log_file)

    @staticmethod
    def flush_file(dbt_log_file: str | None) -> None:
        try:
            from dbt_common.events.event_manager_client import get_event_manager

            get_event_manager().flush()
        except Exception:
            pass
        if not dbt_log_file:
            return
        try:
            with open(dbt_log_file, "a") as handle:
                os.fsync(handle.fileno())
        except OSError:
            pass
