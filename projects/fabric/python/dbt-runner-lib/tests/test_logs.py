"""Tests for `dbt_runner.logs`."""

from __future__ import annotations

import os

from _helpers import runner_payload
from dbt_runner.config import RunnerConfig
from dbt_runner.logs import LogManager, flush_dbt_logs, prepare_log_path


def _cfg(tmp_path, **logging_overrides):
    logging = {"log_path": str(tmp_path / "logs")}
    logging.update(logging_overrides)
    return RunnerConfig.from_mapping(runner_payload(logging=logging))


class TestPrepareLogPath:
    def test_creates_dir_and_sets_env(self, tmp_path, monkeypatch):
        monkeypatch.delenv("DBT_LOG_PATH", raising=False)
        cfg = _cfg(tmp_path)
        dbt_log_file = prepare_log_path(cfg)
        assert dbt_log_file == str(tmp_path / "logs" / "dbt.log")
        assert (tmp_path / "logs").is_dir()
        assert os.environ["DBT_LOG_PATH"] == str(tmp_path / "logs")

    def test_archives_previous_log(self, tmp_path):
        logs = tmp_path / "logs"
        logs.mkdir()
        (logs / "dbt.log").write_text("old run")
        prepare_log_path(_cfg(tmp_path))
        assert not (logs / "dbt.log").exists()
        assert any(p.name.startswith("dbt-archived-at-") for p in logs.iterdir())

    def test_archive_disabled_keeps_log(self, tmp_path):
        logs = tmp_path / "logs"
        logs.mkdir()
        (logs / "dbt.log").write_text("keep me")
        prepare_log_path(_cfg(tmp_path, archive_previous=False))
        assert (logs / "dbt.log").read_text() == "keep me"

    def test_no_log_path_returns_none(self):
        cfg = RunnerConfig.from_mapping(runner_payload())
        assert prepare_log_path(cfg) is None


class TestFlushDbtLogs:
    def test_none_is_safe(self):
        flush_dbt_logs(None)  # must not raise

    def test_missing_file_is_safe(self, tmp_path):
        flush_dbt_logs(str(tmp_path / "nope.log"))  # must not raise

    def test_existing_file_is_fsynced(self, tmp_path):
        log = tmp_path / "dbt.log"
        log.write_text("line")
        flush_dbt_logs(str(log))  # must not raise


class TestLogManager:
    def test_prepare_exposes_dbt_log_file(self, tmp_path):
        mgr = LogManager(_cfg(tmp_path))
        assert mgr.dbt_log_file is None
        produced = mgr.prepare()
        assert produced == mgr.dbt_log_file == str(tmp_path / "logs" / "dbt.log")
        mgr.flush()  # must not raise

    def test_prepare_without_log_path(self):
        mgr = LogManager(RunnerConfig.from_mapping(runner_payload()))
        assert mgr.prepare() is None
        assert mgr.dbt_log_file is None
        mgr.flush()  # must not raise
