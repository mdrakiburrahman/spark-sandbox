"""Loading + decoding entry points that produce a :class:`RunnerConfig`."""

from __future__ import annotations

import base64
import binascii
import importlib.resources as resources
from pathlib import Path
from typing import Any

import yaml

from dbt_runner.config.runner import RunnerConfig
from dbt_runner.errors import RunnerConfigError


def _parse_payload(text: str, *, origin: str) -> dict[str, Any]:
    try:
        loaded = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        raise RunnerConfigError(f"{origin} is not valid YAML: {exc}") from exc
    if not isinstance(loaded, dict):
        raise RunnerConfigError(f"{origin} must parse to a mapping with a top-level 'runner' key")
    if "runner" not in loaded:
        raise RunnerConfigError(f"{origin} must contain a top-level 'runner' key")
    return loaded


def decode_base64(config_base64: str) -> str:
    """Decode a base64 inline-YAML string to UTF-8 text (raises ``RunnerConfigError``)."""
    if not isinstance(config_base64, str) or not config_base64.strip():
        raise RunnerConfigError("config_base64 must be a non-empty base64 string")
    try:
        return base64.b64decode(config_base64.strip(), validate=True).decode("utf-8")
    except (binascii.Error, ValueError) as exc:
        raise RunnerConfigError(f"config_base64 is not valid base64: {exc}") from exc
    except UnicodeDecodeError as exc:
        raise RunnerConfigError(f"config_base64 did not decode to UTF-8 text: {exc}") from exc


def load_runner_config(
    *,
    config: dict[str, Any] | None = None,
    config_yaml: str | None = None,
    config_base64: str | None = None,
    config_path: str | Path | None = None,
) -> RunnerConfig:
    """Resolve and parse the ``runner:`` block from exactly one source.

    Exactly one of ``config`` / ``config_yaml`` / ``config_base64`` /
    ``config_path`` must be supplied — they are mutually exclusive.
    """
    provided = sum(1 for v in (config, config_yaml, config_base64, config_path) if v is not None)
    if provided == 0:
        raise RunnerConfigError("no configuration supplied; pass one of 'config', 'config_yaml', 'config_base64', or 'config_path'")
    if provided > 1:
        raise RunnerConfigError("pass at most one of 'config', 'config_yaml', 'config_base64', or 'config_path' — they are mutually exclusive")

    if config is not None:
        if not isinstance(config, dict):
            raise RunnerConfigError(f"'config' must be a mapping, got {type(config).__name__}")
        payload = config if "runner" in config else {"runner": config}
    elif config_yaml is not None:
        payload = _parse_payload(config_yaml, origin="config_yaml")
    elif config_base64 is not None:
        payload = _parse_payload(decode_base64(config_base64), origin="config_base64")
    else:
        path = Path(config_path)  # type: ignore[arg-type]
        if not path.is_file():
            raise RunnerConfigError(f"config_path {str(path)!r} does not exist")
        payload = _parse_payload(path.read_text(), origin=f"config_path {str(path)!r}")

    return RunnerConfig.from_mapping(payload["runner"])


def load_default_template() -> dict[str, Any]:
    """Load the bundled annotated config template (``config/default.yaml``)."""
    pkg_files = resources.files("dbt_runner")
    packaged = pkg_files / "_resources" / RunnerConfig._DEFAULT_RESOURCE
    if packaged.is_file():
        return yaml.safe_load(packaged.read_text())
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "config" / RunnerConfig._DEFAULT_RESOURCE
        if candidate.is_file():
            return yaml.safe_load(candidate.read_text())
        if (parent / "pyproject.toml").is_file():
            break
    raise RunnerConfigError("bundled default template not found")
