"""The :class:`RuntimeProvider` protocol — source of tokens / storage options /
OneLake identity for a run."""

from __future__ import annotations

from typing import Protocol


class RuntimeProvider(Protocol):
    """Where tokens, Delta storage options, and OneLake identity come from."""

    @property
    def is_fabric(self) -> bool: ...

    def get_token(self, audience: str) -> str: ...

    def storage_options(self) -> dict[str, str] | None: ...

    def onelake_context(self) -> tuple[str | None, str | None]:
        """Return ``(workspace_id, lakehouse_id)`` for abfss path rewriting."""
        ...
