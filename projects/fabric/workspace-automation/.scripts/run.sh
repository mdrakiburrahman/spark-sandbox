#!/usr/bin/env bash
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
CLI="./dist/workspace-automation"
CONFIG="../config/workspace/deployment/dev.json"
WORKSPACE_ID="3ea60ae5-e979-4d31-a317-66491ab497fb"
PIPELINE_NAME="demo_etl"

# ── Args ──────────────────────────────────────────────────────────────────────
COMMAND="${1:?Usage: run.sh <command> [flags...]}"
shift

$CLI "$COMMAND" \
  --workspace-id "$WORKSPACE_ID" \
  --pipeline-name "$PIPELINE_NAME" \
  --config "$CONFIG" \
  "$@"
