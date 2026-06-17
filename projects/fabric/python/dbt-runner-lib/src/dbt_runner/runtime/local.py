"""Devbox runtime: local filesystem, no brokered tokens."""

from __future__ import annotations

from dbt_runner.errors import FabricRuntimeUnavailableError


class LocalRuntime:
    """Local filesystem runtime — Delta writes go to disk, tokens are rejected."""

    is_fabric = False

    def get_token(self, audience: str) -> str:
        raise FabricRuntimeUnavailableError(f"token for audience {audience!r} requires the Fabric notebook runtime; runtime is 'local'")

    def storage_options(self) -> dict[str, str] | None:
        return None

    def onelake_context(self) -> tuple[str | None, str | None]:
        return None, None
