#!/bin/bash
#
#
#       Deploys the Marquito web client to Azure Storage Static Website hosting.   
#
# ---------------------------------------------------------------------------------------
#
set -euo pipefail

[ -z "${MARQUITO_WEBSITE_STORAGE_CONN_STRING:-}" ] && echo "Error: MARQUITO_WEBSITE_STORAGE_CONN_STRING is not set or empty" >&2 && exit 1

GIT_ROOT=$(git rev-parse --show-toplevel)

az storage blob delete-batch -s '$web' --connection-string "$MARQUITO_WEBSITE_STORAGE_CONN_STRING"
az storage blob upload-batch -d '$web' -s "${GIT_ROOT}/projects/marquito/out" --connection-string "$MARQUITO_WEBSITE_STORAGE_CONN_STRING"

echo "Deployment complete."
echo
