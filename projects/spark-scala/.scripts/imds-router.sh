#!/bin/bash
#
#
#       Start a local IMDS router to serve tokens.
#
#       Run  after the script is done to check health:
#
#       ```bash
#       curl -sf http://localhost:6020/healthz | jq
#       ```
#
# ---------------------------------------------------------------------------------------
#
set -e
cd "$(dirname "$0")/.."

# In CI, the IMDS relay router is already started by the workflow on port 8080.
# The tsx-based router is only needed for local development on port 6020.
if [[ "${IS_GH_ACTION}" == "1" ]]; then
  echo "CI detected — IMDS relay router already running on port ${IMDS_ROUTER_PORT:-8080}, skipping tsx router."
  exit 0
fi

mkdir -p .logs
fuser -k -TERM 6020/tcp 2>/dev/null || true
sleep 0.5

setsid npx tsx tools/libs/imds_router/index.ts &

echo
echo "Started IMDS router"
echo

for i in {1..10}; do
  sleep 0.5
  if curl -sf http://localhost:6020/healthz | jq -e '. == {"Healthy":true}'; then
    echo "IMDS router is healthy"
    exit 0
  fi
done

echo "IMDS router failed to start"
cat .logs/imds-router.out
exit 1
