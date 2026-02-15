#!/bin/bash
#
#
#       Script to login to all appropriate pre-req endpoints before running
#       Spark Jobs or tests.
#
#       This is meant to be run:
#
#         --                        --
#         IN                        BY
#         --                        --
#
#       - VS Code Devcontainer:     Human being
#       - 1ES Devcontainer:         UAMI
#
# ---------------------------------------------------------------------------------------
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/common.sh"

echo

echo ">>> Checking generic refresh token"
az account get-access-token --query "expiresOn" -o tsv >/dev/null 2>&1
if [[ $? -ne 0 ]]; then
    if [[ $IS_GH_ACTION == "1" ]]; then
        echo "Running in 1ES machine, couldn't retrieve refresh token, trying as ${UAMI_CLIENT_ID}"
        retry az login --identity --client-id $UAMI_CLIENT_ID
    else
        echo "Running in Visual Studio Code, couldn't retrieve refresh token, trying as end user"
        az login >/dev/null
    fi
else
    echo ">>> Successfully retrieved existing refresh token."
fi

echo ">>> Checking refresh token for https://database.windows.net"
az account get-access-token --resource https://database.windows.net --query "expiresOn" -o tsv >/dev/null 2>&1
if [[ $? -ne 0 ]]; then
    if [[ $IS_GH_ACTION == "1" ]]; then
        echo "Running in 1ES machine, couldn't retrieve refresh token for https://database.windows.net, trying as ${UAMI_CLIENT_ID}"
        retry az login --identity --client-id $UAMI_CLIENT_ID --scope https://database.windows.net/.default
    else
        echo "Couldn't retrieve refresh token for https://database.windows.net, trying as end user - this should open up your browser"
        az login --scope https://database.windows.net/.default
    fi
else
    echo ">>> Successfully retrieved existing refresh token for https://database.windows.net."
fi
