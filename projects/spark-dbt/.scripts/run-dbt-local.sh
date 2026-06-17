#!/usr/bin/env bash
#
#
#       Run a dbt project end-to-end through the shared `dbt-runner-lib`.
#
#       This script is a thin wrapper: it builds the inline-YAML `runner:`
#       config (local-local target, metrics localized under .temp/dbt-runner),
#       base64-encodes it, and hands it to `python -m dbt_runner run`. The
#       library performs deps/debug/seed/build/cleanup/docs, collects node
#       metrics, and writes the SAME Delta table Fabric produces — only the
#       paths differ.
#
#       Usage: run-dbt-local.sh <dbt-project> [target]
#       Example: run-dbt-local.sh dbt-adventureworks local-local
#
#       Targets:
#         local-local   - Local dbt client + Local spark server (default)
#         local-fabric  - Local dbt client + Fabric spark server
#         fabric-fabric - Fabric dbt client + Fabric spark server
#
#       Env:
#         FULL_REFRESH=1  - pass --full-refresh to seed + build
#         DBT_DEBUG=true  - verbose dbt logging
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
SPARK_DBT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
GIT_ROOT="$(git -C "${SPARK_DBT_DIR}" rev-parse --show-toplevel)"

cd "${SPARK_DBT_DIR}"
source .venv/bin/activate

export DBT_DEBUG="${DBT_DEBUG:-false}"
FULL_REFRESH="${FULL_REFRESH:-0}"
if [[ "${FULL_REFRESH}" == "1" ]]; then
    FR="true"
else
    FR="false"
fi

PROJECT_DIR="${SPARK_DBT_DIR}/${DBT_PROJECT}"
OUT_DIR="${SPARK_DBT_DIR}/.temp/dbt-runner"
PROJECT_OUT_DIR="${OUT_DIR}/${DBT_PROJECT}"

if [[ ! -d "${PROJECT_DIR}" ]]; then
    echo "Error: dbt project directory not found: ${PROJECT_DIR}" >&2
    exit 1
fi

echo "Running dbt project '${DBT_PROJECT}' with target '${DBT_TARGET}' (full_refresh=${FULL_REFRESH})"
echo "Metrics + logs localized under: ${PROJECT_OUT_DIR}"

RUNNER_YAML=$(cat <<YAML
runner:
  project_name: ${DBT_PROJECT}
  project_dir: ${PROJECT_DIR}
  profiles_dir: ${PROJECT_DIR}
  target: ${DBT_TARGET}
  git_root: ${GIT_ROOT}
  runtime: local
  vars: {}
  pipeline:
    - command: deps
    - command: debug
    - command: seed
      full_refresh: ${FR}
      collect_metrics: true
      copy_run_results: true
    - command: build
      exclude: [resource_type:seed]
      full_refresh: ${FR}
      collect_metrics: true
      copy_run_results: true
    - command: run-operation
      macro: cleanup_dbt_tmp_relations
      if_macro_exists: true
    - command: docs-generate
  logging:
    log_path: ${PROJECT_OUT_DIR}/logs
    archive_previous: true
  metrics:
    enabled: true
    delta_path: ${OUT_DIR}/raw/dbt/dbt_node_executions
    raw_path: ${PROJECT_OUT_DIR}/metrics/dbt/${DBT_PROJECT}
    partition_by: [project, event_year_month]
    archive_previous_raw: true
  session:
    close: false
YAML
)

RUNNER_CONFIG_B64=$(printf '%s' "${RUNNER_YAML}" | base64 -w0)

python -m dbt_runner run --config-base64 "${RUNNER_CONFIG_B64}"
