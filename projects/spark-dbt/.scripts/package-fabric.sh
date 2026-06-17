#!/usr/bin/env bash
#
#
#       Package dbt projects + dependencies for Microsoft Fabric.
#       Creates a tar.gz bundle ready to upload to OneLake.
#
#       Usage: package-fabric.sh [output-dir]
#       Example: package-fabric.sh ./dist
#
# ---------------------------------------------------------------------------------------
#
set -euo pipefail

PYTHON_VERSION="3.12"
PLATFORMS="manylinux2014_x86_64 linux_x86_64 any"
DBT_PROJECTS=(dbt-adventureworks dbt-jaffle-shop dbt-dataops dbt-reddit)
BUNDLE_NAME="dbt-fabric-bundle"

cd "$(dirname "$0")/.."
source .venv/bin/activate

OUT="${1:-dist}"
rm -rf "$OUT" && mkdir -p "$OUT/$BUNDLE_NAME"/{wheels,projects}

GIT_ROOT=$(git rev-parse --show-toplevel)
RUNNER_LIB_DIST="${GIT_ROOT}/projects/fabric/python/dbt-runner-lib/dist"
mapfile -t RUNNER_WHEELS < <(ls "${RUNNER_LIB_DIST}"/dbt_runner_lib-*.whl 2>/dev/null)
if [[ ${#RUNNER_WHEELS[@]} -eq 0 ]]; then
  echo "ERROR: dbt_runner_lib wheel not found. Run 'npx nx run dbt-runner-lib:build' first." >&2
  exit 1
fi
if [[ ${#RUNNER_WHEELS[@]} -gt 1 ]]; then
  echo "ERROR: multiple dbt_runner_lib wheels in ${RUNNER_LIB_DIST}. Clean stale builds:" >&2
  printf '  %s\n' "${RUNNER_WHEELS[@]}" >&2
  exit 1
fi
RUNNER_WHEEL="${RUNNER_WHEELS[0]}"
echo "Using dbt-runner-lib wheel: $(basename "${RUNNER_WHEEL}")"

hatch dep show requirements 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g' | \
  sed "s|^dbt[-_]runner[-_]lib\s*@\s*file://.*$|dbt-runner-lib @ file://${RUNNER_WHEEL}|" | \
  pip download -q --dest "$OUT/$BUNDLE_NAME/wheels" --python-version "$PYTHON_VERSION" \
  $(printf -- '--platform %s ' $PLATFORMS) --only-binary=:all: -r /dev/stdin

for p in "${DBT_PROJECTS[@]}"; do
  rsync -a --exclude='target' --exclude='logs' --exclude='dbt_packages' "$p/" "$OUT/$BUNDLE_NAME/projects/$p/"
done

tar -czf "$OUT/$BUNDLE_NAME.tar.gz" -C "$OUT" "$BUNDLE_NAME" && rm -rf "$OUT/$BUNDLE_NAME"

echo ""
echo "=== Package complete ==="
du -sh "$OUT"/*
echo ""
echo "Upload to Fabric Lakehouse:"
echo "  1. $OUT/$BUNDLE_NAME.tar.gz  →  Files/$BUNDLE_NAME.tar.gz"
