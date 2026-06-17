"""Tests for `dbt_runner.__main__` (the CLI)."""

from __future__ import annotations

import base64

import pytest

from dbt_runner.__main__ import main


def _b64(yaml_str: str) -> str:
    return base64.b64encode(yaml_str.encode()).decode()


# A dbt-free pipeline (single shell step) so the CLI exercises the real
# load -> DbtRunner -> run path without needing dbt-core installed.
_SHELL_ONLY = """
runner:
  project_name: dbt-cli-test
  project_dir: /tmp
  target: local-local
  runtime: local
  pipeline:
    - command: shell
      argv: ["true"]
  metrics:
    enabled: false
"""


class TestCli:
    def test_run_shell_only_succeeds(self, capsys):
        assert main(["run", "--config-base64", _b64(_SHELL_ONLY)]) == 0

    def test_run_from_yaml(self):
        assert main(["run", "--config-yaml", _SHELL_ONLY]) == 0

    def test_run_invalid_base64_returns_1(self, capsys):
        assert main(["run", "--config-base64", "!!!notb64!!!"]) == 1
        assert "ERROR" in capsys.readouterr().err

    def test_show_default_prints_template(self, capsys):
        assert main(["show-default"]) == 0
        assert "runner" in capsys.readouterr().out

    def test_missing_subcommand_errors(self):
        with pytest.raises(SystemExit):
            main([])
