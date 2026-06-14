#!/usr/bin/env bash
#
#
#       Lint a single dbt project (black + dbt deps + sqlfluff fix/lint).
#
#       Usage: lint-dbt.sh <dbt-project>
#       Example: lint-dbt.sh dbt-adventureworks
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

if [[ ! -d "${DBT_PROJECT}" ]]; then
    echo "Error: dbt project directory '${DBT_PROJECT}' not found under $(pwd)" >&2
    exit 1
fi

source .venv/bin/activate

export GIT_ROOT=$(git rev-parse --show-toplevel)

black --line-length 2000 "${DBT_PROJECT}"

dbt deps --project-dir "${DBT_PROJECT}" --profiles-dir "${DBT_PROJECT}"

cd "${DBT_PROJECT}"

LINT_DIRS=()
for d in models snapshots; do
    [[ -d "${d}" ]] && LINT_DIRS+=("${d}")
done

if [[ ${#LINT_DIRS[@]} -eq 0 ]]; then
    echo "No models/ or snapshots/ directory under ${DBT_PROJECT}; skipping sqlfluff"
    exit 0
fi

DBT_LINT_MODE=true sqlfluff fix "${LINT_DIRS[@]}" --dialect sparksql --ignore parsing || true
DBT_LINT_MODE=true sqlfluff lint "${LINT_DIRS[@]}" --dialect sparksql --ignore parsing
