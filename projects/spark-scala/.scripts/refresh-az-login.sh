#!/bin/bash
#
#
#       Script to login to all appropriate pre-req endpoints before running
#       Spark Jobs or tests.
#
# ---------------------------------------------------------------------------------------
#

echo

echo ">>> Checking generic refresh token"
az account get-access-token --query "expiresOn" -o tsv >/dev/null 2>&1
if [[ $? -ne 0 ]]; then
    echo "Running in Visual Studio Code, couldn't retrieve refresh token, trying as end user"
        az login >/dev/null
else
    echo ">>> Successfully retrieved existing refresh token."
fi

echo ">>> Checking refresh token for https://database.windows.net"
az account get-access-token --resource https://database.windows.net --query "expiresOn" -o tsv >/dev/null 2>&1
if [[ $? -ne 0 ]]; then
    echo "Couldn't retrieve refresh token for https://database.windows.net, trying as end user - this should open up your browser"
        az login --scope https://database.windows.net/.default
else
    echo ">>> Successfully retrieved existing refresh token for https://database.windows.net."
fi
