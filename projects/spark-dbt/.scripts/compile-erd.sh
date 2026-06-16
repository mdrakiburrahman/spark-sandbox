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

PIDS=()
PROJECTS=()

for PROJECT_DIR in dbt-*/; do
    PROJECT_NAME=$(basename "$PROJECT_DIR")

    # dbt-reddit's ERD is hand-maintained as erd/reddit.dbml (single source of
    # truth) — skip it so no competing erd/full_model.dbml is generated.
    if [[ "$PROJECT_NAME" == "dbt-reddit" ]]; then
        echo "=== Skipping ${PROJECT_NAME} (ERD hand-maintained at erd/reddit.dbml) ==="
        continue
    fi

    PROJECT_ABS=$(cd "$PROJECT_DIR" && pwd)
    echo "=== Preparing ${PROJECT_NAME} (background) ==="

    (
        cd "$PROJECT_ABS"
        export DBT_PROFILES_DIR="$PROJECT_ABS"
        dbt deps --quiet
        dbt parse --target "${DBT_TARGET}"
        dbt docs generate --target "${DBT_TARGET}"
        echo "=== Done ${PROJECT_NAME} ==="
    ) &
    PIDS+=($!)
    PROJECTS+=("$PROJECT_NAME")
done

FAILED=0
for i in "${!PIDS[@]}"; do
    if ! wait "${PIDS[$i]}"; then
        echo "ERROR: ${PROJECTS[$i]} failed" >&2
        FAILED=1
    fi
done

if [[ "$FAILED" -ne 0 ]]; then
    exit 1
fi

python3 "${SCRIPT_DIR}/compile_erd.py"
