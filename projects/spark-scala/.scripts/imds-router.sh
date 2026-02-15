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
