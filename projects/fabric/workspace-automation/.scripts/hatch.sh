#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_DIR}"

TARGET="${1:-}"
shift || true

case "${TARGET}" in
  env)
    # Create the hatch environment
    hatch env create "${@}"
    ;;
  build)
    # Run hatch build scripts
    hatch run build:"${@}"
    ;;
  run)
    # Run arbitrary hatch commands
    hatch run "${@}"
    ;;
  clean)
    # Clean all Python state: hatch envs, build artifacts, caches
    rm -rf .venv build dist *.egg-info .pytest_cache .mypy_cache .ruff_cache .coverage htmlcov
    hatch env prune 2>/dev/null || true
    rm -rf ~/.local/share/hatch/env/virtual/workspace-automation 2>/dev/null || true
    find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
    ;;
  *)
    echo "Usage: hatch.sh {env|build|run|clean} [args...]"
    exit 1
    ;;
esac
