"""Close the Fabric Spark (Livy) session dbt opened.

Only used when ``session.close`` is true (Fabric runs). The local Livy session is
intentionally reused across runs via its ``session_id_file``. Never raises — a
failed close is a warning, not a run failure.
"""

from __future__ import annotations

import os
from typing import Any, Callable

import yaml

from dbt_runner.config import RunnerConfig
from dbt_runner.runtime import RuntimeProvider
from dbt_runner.session.livy import build_livy_delete_url, resolve_env_var

# An HTTP DELETE: takes (url, headers), returns a response-like object.
HttpDelete = Callable[[str, dict[str, str]], Any]


def _default_http_delete(url: str, headers: dict[str, str]) -> Any:
    import requests

    return requests.delete(url, headers=headers)


class SessionCloser:
    """Closes the Livy session referenced by a project's profiles.yml target."""

    def __init__(
        self,
        config: RunnerConfig,
        runtime: RuntimeProvider,
        *,
        env: dict[str, str] | None = None,
        http_delete: HttpDelete | None = None,
    ) -> None:
        self._config = config
        self._runtime = runtime
        self._env = env if env is not None else dict(os.environ)
        self._http_delete = http_delete or _default_http_delete

    def close(self) -> None:
        """Close the session if configured. Never raises."""
        if not self._config.session.close:
            return
        project = self._config.project_name
        try:
            profiles_path = f"{self._config.profiles_dir}/profiles.yml"
            with open(profiles_path) as handle:
                profiles = yaml.safe_load(handle)
            profile_name = next(iter(profiles))
            target = self._config.session.target or self._config.target
            cfg = profiles[profile_name]["outputs"][target]

            with open(cfg["session_id_file"]) as handle:
                session_id = handle.read().strip()

            workspace_id = self._config.session.workspace_id or resolve_env_var(cfg.get("workspaceid"), "FABRIC_WORKSPACE_ID", self._env)
            lakehouse_id = self._config.session.lakehouse_id or resolve_env_var(cfg.get("lakehouseid"), "FABRIC_LAKEHOUSE_ID", self._env)

            url = build_livy_delete_url(self._config.session.endpoint, workspace_id, lakehouse_id, session_id)
            print(f"Deleting session {session_id}: {url}")
            response = self._http_delete(url, {"Authorization": f"Bearer {self._runtime.get_token('pbi')}"})
            print(f"Delete session {session_id}: {getattr(response, 'status_code', '?')} {getattr(response, 'reason', '')}")
        except Exception as exc:
            print(f"Warning: failed to close Livy session for {project}: {exc}")
