"""The result object for a single executed pipeline step."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class StepOutcome:
    """Result of executing one pipeline step."""

    command: str
    success: bool
    skipped: bool = False
    dbt_result: Any = None
    detail: str = ""
