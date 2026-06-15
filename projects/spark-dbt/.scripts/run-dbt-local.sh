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

# In CI (self-hosted runners share a persisted Hive metastore but the workspace
# is ephemeral), default to a full refresh so incrementals + snapshots rebuild
# from scratch and we don't trip over stale catalog entries that point to
# already-cleaned-up Delta paths. Locally, default remains incremental.
if [[ "${IS_GH_ACTION:-0}" == "1" ]]; then
    FULL_REFRESH="${FULL_REFRESH:-1}"
else
    FULL_REFRESH="${FULL_REFRESH:-0}"
fi

FULL_REFRESH_FLAG=""
if [[ "${FULL_REFRESH}" == "1" ]]; then
    FULL_REFRESH_FLAG="--full-refresh"
fi

echo "Running dbt project '${DBT_PROJECT}' with target '${DBT_TARGET}' (full_refresh=${FULL_REFRESH})"

dbt debug --target "${DBT_TARGET}"
dbt deps
if [[ "${IS_GH_ACTION:-0}" == "1" ]]; then
    echo "IS_GH_ACTION=1: dropping stale catalog entries before seed/build"
    dbt run-operation _ci_reset_state --target "${DBT_TARGET}"
fi
dbt seed --target "${DBT_TARGET}" ${FULL_REFRESH_FLAG}
dbt build --exclude resource_type:seed --target "${DBT_TARGET}" ${FULL_REFRESH_FLAG}
if grep -rql 'macro cleanup_dbt_tmp_relations' macros/ 2>/dev/null; then
    dbt run-operation cleanup_dbt_tmp_relations --target "${DBT_TARGET}"
fi
dbt docs generate --target "${DBT_TARGET}"
