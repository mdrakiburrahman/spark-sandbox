"""Primitive validation helpers shared across the config models."""

from __future__ import annotations

from typing import Any

from dbt_runner.errors import RunnerConfigError


def require_non_empty_str(value: Any, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise RunnerConfigError(f"{field_name!r} must be a non-empty string, got {value!r}")
    return value.strip()


def as_str_tuple(value: Any, field_name: str) -> tuple[str, ...]:
    if value is None:
        return ()
    if isinstance(value, str):
        # A bare string is a common single-item shorthand.
        return (value,)
    if not isinstance(value, (list, tuple)):
        raise RunnerConfigError(f"{field_name!r} must be a list of strings, got {type(value).__name__}")
    out: list[str] = []
    for i, item in enumerate(value):
        if not isinstance(item, str) or not item.strip():
            raise RunnerConfigError(f"{field_name}[{i}] must be a non-empty string, got {item!r}")
        out.append(item.strip())
    return tuple(out)


def as_bool(value: Any, field_name: str, *, default: bool) -> bool:
    if value is None:
        return default
    if not isinstance(value, bool):
        raise RunnerConfigError(f"{field_name!r} must be a boolean, got {type(value).__name__}")
    return value
