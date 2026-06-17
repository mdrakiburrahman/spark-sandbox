"""Fabric notebook runtime backed by ``notebookutils`` (imported lazily).

``notebookutils`` ships only with the Fabric Spark / Python notebook runtime and
is not pip-installable, so the import is deferred to first use — the library
stays importable (and unit-testable) on a plain devbox.
"""

from __future__ import annotations

from typing import Any

from dbt_runner.errors import FabricRuntimeUnavailableError


class FabricRuntime:
    """Brokered tokens + OneLake context via ``notebookutils``."""

    is_fabric = True

    @staticmethod
    def _notebookutils() -> Any:
        try:
            import notebookutils  # type: ignore[import-not-found]
        except ImportError as exc:
            raise FabricRuntimeUnavailableError("runtime 'fabric' requires the Fabric notebook runtime ('notebookutils' is not installable via pip)") from exc
        return notebookutils

    def get_token(self, audience: str) -> str:
        token = self._notebookutils().credentials.getToken(audience)
        if not isinstance(token, str) or not token:
            raise FabricRuntimeUnavailableError(f"notebookutils.credentials.getToken({audience!r}) returned {token!r}")
        return token

    def storage_options(self) -> dict[str, str] | None:
        return {"bearer_token": self.get_token("storage"), "use_fabric_endpoint": "true"}

    def onelake_context(self) -> tuple[str | None, str | None]:
        ctx = self._notebookutils().runtime.context
        workspace_id = ctx.get("defaultLakehouseWorkspaceId") or ctx.get("currentWorkspaceId")
        lakehouse_id = ctx.get("defaultLakehouseId")
        return workspace_id, lakehouse_id
