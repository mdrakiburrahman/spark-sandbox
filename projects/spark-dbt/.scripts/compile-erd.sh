#!/usr/bin/env bash
#
#       Script to compile dbt artifacts into DBML ERD diagrams using dbterd.
#
# ---------------------------------------------------------------------------------------
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.."
source .venv/bin/activate

DBT_TARGET="${DBT_TARGET:-local-local}"
export DBT_DEBUG="${DBT_DEBUG:-false}"

for PROJECT_DIR in dbt-*/; do
    PROJECT_NAME=$(basename "$PROJECT_DIR")
    echo "=== Preparing ${PROJECT_NAME} ==="

    pushd "${PROJECT_DIR}" > /dev/null
    export DBT_PROFILES_DIR=$(pwd)

    dbt deps --quiet
    dbt parse --target "${DBT_TARGET}"

    popd > /dev/null
done

python3 "${SCRIPT_DIR}/compile_erd.py"
