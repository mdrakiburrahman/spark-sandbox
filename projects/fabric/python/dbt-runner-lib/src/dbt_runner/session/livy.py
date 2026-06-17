"""Pure helpers for the Fabric Livy session API + dbt env_var resolution."""

from __future__ import annotations

import re
from typing import Any

_ENV_VAR_RE = re.compile(r"\{\{\s*env_var\s*\(\s*'[^']*'\s*,\s*'([^']*)'\s*\)\s*\}\}")


def resolve_env_var(yaml_value: Any, env_key: str, env: dict[str, str]) -> Any:
    """Return ``env[env_key]`` if set, else the default inside a dbt
    ``{{ env_var('KEY', 'default') }}`` template string, else the value as-is."""
    env_val = env.get(env_key)
    if env_val:
        return env_val
    if isinstance(yaml_value, str):
        match = _ENV_VAR_RE.search(yaml_value)
        if match:
            return match.group(1)
    return yaml_value


def build_livy_delete_url(endpoint: str, workspace_id: str, lakehouse_id: str, session_id: str) -> str:
    return f"{endpoint.rstrip('/')}/workspaces/{workspace_id}/lakehouses/{lakehouse_id}/livyApi/versions/2023-12-01/sessions/{session_id}"
