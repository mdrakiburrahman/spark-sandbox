#!/bin/bash
#
#   Wrapper for hatch commands inside dbt-runner-lib.
#
#   Usage:
#     ./hatch.sh clean              Clean envs and build artifacts
#     ./hatch.sh env create         Create the default hatch env
#     ./hatch.sh build              Build the wheel
#     ./hatch.sh run lint:format    Run lint
#     ./hatch.sh run test           Run tests
#
set -e

cd "$(dirname "$0")/.."

TARGET="$1"
case "$TARGET" in
    clean)
        hatch env prune || true
        rm -rf .pytest_cache .venv dist tests/__pycache__ build *.egg-info .hatch
        ;;
    *)
        hatch "$@"
        ;;
esac
