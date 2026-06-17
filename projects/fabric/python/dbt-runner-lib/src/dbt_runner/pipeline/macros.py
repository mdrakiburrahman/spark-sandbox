"""Resolve whether a dbt macro is defined in a project's ``macros/`` tree."""

from __future__ import annotations

import glob
import os


class MacroResolver:
    """Looks up ``{% macro <name> %}`` definitions under ``<project_dir>/macros``."""

    def __init__(self, project_dir: str) -> None:
        self._macros_dir = os.path.join(project_dir, "macros")

    def exists(self, macro: str) -> bool:
        if not os.path.isdir(self._macros_dir):
            return False
        needle = f"macro {macro}"
        for path in glob.glob(os.path.join(self._macros_dir, "**", "*.sql"), recursive=True):
            try:
                with open(path, "r", encoding="utf-8", errors="ignore") as handle:
                    if needle in handle.read():
                        return True
            except OSError:
                continue
        return False


def macro_exists(project_dir: str, macro: str) -> bool:
    """Functional shim over :meth:`MacroResolver.exists`."""
    return MacroResolver(project_dir).exists(macro)
