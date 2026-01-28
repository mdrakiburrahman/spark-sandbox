#!/usr/bin/env bash
#
#
#       Script to run a dbt project end-to-end, including debug, deps, seed,
#       run, test, and docs generation.
#
#       Usage: run-dbt.sh <dbt-project>
#       Example: run-dbt.sh dbt-adventureworks
#
# ---------------------------------------------------------------------------------------
#
set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <dbt-project>"
    echo "Example: $0 dbt-adventureworks"
    exit 1
fi

DBT_PROJECT="$1"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.."
source .venv/bin/activate

cd "${DBT_PROJECT}"

export DBT_PROFILES_DIR=$(pwd)

dbt debug
dbt deps
[[ $(yq e ".${DBT_PROJECT//-/_}.outputs.fabric-dev.livy_mode" profiles.yml) == "fabric" ]] && dbt seed || echo "Skipping dbt seed (livy_mode = local)"
dbt run
dbt test
dbt docs generate
