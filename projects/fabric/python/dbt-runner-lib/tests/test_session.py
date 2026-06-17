"""Tests for `dbt_runner.session`."""

from __future__ import annotations

from types import SimpleNamespace

import yaml

from _helpers import runner_payload
from dbt_runner.config import RunnerConfig
from dbt_runner.session import SessionCloser, build_livy_delete_url, resolve_env_var


class _FakeRuntime:
    def get_token(self, audience):
        return f"tok-{audience}"

    def storage_options(self):
        return None

    def onelake_context(self):
        return None, None


class TestHelpers:
    def test_build_url(self):
        url = build_livy_delete_url("https://api.fabric.microsoft.com/v1", "ws", "lh", "sess-9")
        assert url == "https://api.fabric.microsoft.com/v1/workspaces/ws/lakehouses/lh/livyApi/versions/2023-12-01/sessions/sess-9"

    def test_resolve_env_var_prefers_env(self):
        assert resolve_env_var("{{ env_var('K', 'default') }}", "K", {"K": "from-env"}) == "from-env"

    def test_resolve_env_var_extracts_default(self):
        assert resolve_env_var("{{ env_var('K', 'the-default') }}", "K", {}) == "the-default"

    def test_resolve_env_var_passthrough(self):
        assert resolve_env_var("literal-value", "K", {}) == "literal-value"


def _profiles(tmp_path, target="fabric-fabric"):
    session_file = tmp_path / "livy-session-id.txt"
    session_file.write_text("session-123\n")
    profiles = {
        "example": {
            "outputs": {
                target: {
                    "session_id_file": str(session_file),
                    "workspaceid": "{{ env_var('FABRIC_WORKSPACE_ID', 'ws-default') }}",
                    "lakehouseid": "{{ env_var('FABRIC_LAKEHOUSE_ID', 'lh-default') }}",
                }
            }
        }
    }
    (tmp_path / "profiles.yml").write_text(yaml.safe_dump(profiles))


class TestSessionCloser:
    def test_close_disabled_is_noop(self, tmp_path):
        cfg = RunnerConfig.from_mapping(runner_payload(profiles_dir=str(tmp_path)))
        calls = []
        SessionCloser(cfg, _FakeRuntime(), http_delete=lambda url, headers: calls.append(url)).close()
        assert calls == []

    def test_close_issues_delete(self, tmp_path):
        _profiles(tmp_path)
        cfg = RunnerConfig.from_mapping(
            runner_payload(
                profiles_dir=str(tmp_path),
                target="fabric-fabric",
                runtime="fabric",
                session={"close": True, "target": "fabric-fabric"},
            )
        )
        captured = {}

        def fake_delete(url, headers):
            captured["url"] = url
            captured["headers"] = headers
            return SimpleNamespace(status_code=200, reason="OK")

        SessionCloser(cfg, _FakeRuntime(), env={}, http_delete=fake_delete).close()
        assert captured["url"].endswith("/sessions/session-123")
        assert "ws-default" in captured["url"]
        assert "lh-default" in captured["url"]
        assert captured["headers"]["Authorization"] == "Bearer tok-pbi"

    def test_close_env_overrides_defaults(self, tmp_path):
        _profiles(tmp_path)
        cfg = RunnerConfig.from_mapping(
            runner_payload(
                profiles_dir=str(tmp_path),
                target="fabric-fabric",
                runtime="fabric",
                session={"close": True, "target": "fabric-fabric"},
            )
        )
        captured = {}
        env = {"FABRIC_WORKSPACE_ID": "ws-real", "FABRIC_LAKEHOUSE_ID": "lh-real"}
        SessionCloser(cfg, _FakeRuntime(), env=env, http_delete=lambda url, headers: captured.setdefault("url", url) or SimpleNamespace(status_code=200, reason="OK")).close()
        assert "ws-real" in captured["url"]
        assert "lh-real" in captured["url"]

    def test_close_never_raises_on_missing_profiles(self, tmp_path):
        cfg = RunnerConfig.from_mapping(runner_payload(profiles_dir=str(tmp_path), runtime="fabric", session={"close": True, "target": "fabric-fabric"}))
        # No profiles.yml on disk — must warn, not raise.
        SessionCloser(cfg, _FakeRuntime(), http_delete=lambda url, headers: None).close()
