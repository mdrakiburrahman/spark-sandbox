#!/bin/bash
#
#
#       Wraps fabric-workspace deployment.
#
# ---------------------------------------------------------------------------------------
#
set -e

args=("$@")
config_file=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --config-file-absolute-path)
      config_file="$2"
      shift 2
      ;;
    --operation)
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [[ -n "$config_file" && ! -f "$config_file" ]]; then
  echo "Config file does not exist - exiting gracefully: $config_file"
  exit 0
fi

source "$(realpath $(dirname $0))/common.sh"

export FAB_PATH="$HOME/.local/bin"
export FAB_TENANT_ID="72f988bf-86f1-41af-91ab-2d7cd011db47"
export GIT_ROOT=$(git rev-parse --show-toplevel)

export FAB_TOKEN=$(az account get-access-token --resource 'https://analysis.windows.net/powerbi/api' --query accessToken -o tsv)
export FAB_TOKEN_AZURE=$(az account get-access-token --resource 'https://management.azure.com' --query accessToken -o tsv)
export FAB_TOKEN_CICD=$(az account get-access-token --resource 'https://api.fabric.microsoft.com' --query accessToken -o tsv)

if [[ $IS_GH_ACTION == "1" ]]; then
    export LOG_LEVEL="${LOG_LEVEL:-DEBUG}"
else
    export LOG_LEVEL="${LOG_LEVEL:-INFO}"
fi

export FAB_TOKEN_ONELAKE=${FAB_TOKEN}

FABRIC_DEPLOY_BIN="$(pip show fabric-workspace-deployment 2>/dev/null | grep Location | awk '{print $2}')/../../../bin/fabric-workspace-deployment"
echo "Running: ${FABRIC_DEPLOY_BIN} ${args[*]}"
"${FABRIC_DEPLOY_BIN}" "${args[@]}"
