#!/usr/bin/env bash
#
#
#       Script to run a dbt project end-to-end, including debug, deps, build,
#       and docs generation.
#
#       Usage: run-dbt-local.sh <dbt-project> [target]
#       Example: run-dbt-local.sh dbt-adventureworks local-local
#
#       Targets:
#         local-local   - Local dbt client + Local spark server (default)
#         local-fabric  - Local dbt client + Fabric spark server
#         fabric-fabric - Fabric dbt client + Fabric spark server
#
# ---------------------------------------------------------------------------------------
#
set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <dbt-project> [target]"
    echo "Example: $0 dbt-adventureworks local-local"
    echo ""
    echo "Targets:"
    echo "  local-local   - Local dbt client + Local spark server (default)"
    echo "  local-fabric  - Local dbt client + Fabric spark server"
    echo "  fabric-fabric - Fabric dbt client + Fabric spark server"
    exit 1
fi

DBT_PROJECT="$1"
DBT_TARGET="${2:-local-local}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.."
source .venv/bin/activate

cd "${DBT_PROJECT}"

export DBT_PROFILES_DIR=$(pwd)
export DBT_DEBUG="${DBT_DEBUG:-false}"
FULL_REFRESH="${FULL_REFRESH:-0}"

FULL_REFRESH_FLAG=""
if [[ "${FULL_REFRESH}" == "1" ]]; then
    FULL_REFRESH_FLAG="--full-refresh"
fi

echo "Running dbt project '${DBT_PROJECT}' with target '${DBT_TARGET}' (full_refresh=${FULL_REFRESH})"

dbt debug --target "${DBT_TARGET}"
dbt deps
dbt seed --target "${DBT_TARGET}" ${FULL_REFRESH_FLAG}
dbt build --exclude resource_type:seed --target "${DBT_TARGET}" ${FULL_REFRESH_FLAG}
dbt docs generate --target "${DBT_TARGET}"
