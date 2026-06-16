#!/usr/bin/env bash
#
#
#       Script to lint a single dbt project: black (Python) + sqlfluff (SQL).
#
#       Mirrors run-dbt-local.sh: activates the shared hatch venv, cd's into the
#       project, points DBT_PROFILES_DIR at it, then runs sqlfluff with the dbt
#       templater (sparksql) against the dirs that exist among models/snapshots.
#
#       Usage: lint-dbt.sh <dbt-project>
#       Example: lint-dbt.sh dbt-dataops
#
# ---------------------------------------------------------------------------------------
#
set -euo pipefail

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <dbt-project>"
    echo "Example: $0 dbt-dataops"
    exit 1
fi

DBT_PROJECT="$1"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.."
source .venv/bin/activate

if [[ ! -d "${DBT_PROJECT}" ]]; then
    echo "Error: dbt project directory '${DBT_PROJECT}' not found under $(pwd)" >&2
    exit 1
fi

export GIT_ROOT=$(git rev-parse --show-toplevel)

echo "Linting Python (black) for '${DBT_PROJECT}'"
black --line-length 2000 "${DBT_PROJECT}"

cd "${DBT_PROJECT}"
export DBT_PROFILES_DIR=$(pwd)

dbt deps

LINT_DIRS=()
for d in models snapshots; do
    if [[ -d "${d}" ]]; then
        LINT_DIRS+=("${d}")
    fi
done

if [[ ${#LINT_DIRS[@]} -eq 0 ]]; then
    echo "No lintable directories (models/snapshots) found in '${DBT_PROJECT}'; skipping sqlfluff."
    exit 0
fi

echo "Linting SQL (sqlfluff) for '${DBT_PROJECT}': ${LINT_DIRS[*]}"
sqlfluff fix "${LINT_DIRS[@]}" --dialect sparksql --ignore templating,parsing
sqlfluff lint "${LINT_DIRS[@]}" --dialect sparksql --ignore templating,parsing
