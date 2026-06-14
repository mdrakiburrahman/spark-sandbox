#!/bin/bash
# ---------------------------------------------------------------------------
# deploy-gh-runner.sh — Wraps `terraform init/apply/destroy/plan` for the
# Azure self-hosted runner stack at projects/infra/github-runner/terraform/.
#
# Reads projects/infra/github-runner/.env for:
#   GH_REPO
#   TF_RESOURCE_GROUP, TF_SUBSCRIPTION_ID
#   TF_STATE_STORAGE_ACCOUNT_NAME, TF_STATE_STORAGE_ACCOUNT_CONTAINER,
#   TF_STATE_STORAGE_ACCOUNT_KEY
# Plus optional TF_VAR_* overrides (e.g. TF_VAR_location,
# TF_VAR_instance_sku, TF_VAR_instance_count) which Terraform picks up
# automatically.
#
# The runner registration token is auto-minted on each `apply` from the
# already-authenticated `gh` CLI session.
#
# Usage:
#   .scripts/deploy-gh-runner.sh apply
#   .scripts/deploy-gh-runner.sh destroy
#   .scripts/deploy-gh-runner.sh plan
#   .scripts/deploy-gh-runner.sh output
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." &>/dev/null && pwd)"

if [[ ! -f "$PROJECT_ROOT/.env" ]]; then
  echo "ERROR: .env not found at $PROJECT_ROOT/.env" >&2
  echo "Copy .env.example to .env and fill in the values." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$PROJECT_ROOT/.env"
set +a

ACTION="${1:-apply}"

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "ERROR: required env var $name is empty in .env" >&2
    exit 1
  fi
}

require_env GH_REPO
require_env TF_RESOURCE_GROUP
require_env TF_SUBSCRIPTION_ID
require_env TF_STATE_STORAGE_ACCOUNT_NAME
require_env TF_STATE_STORAGE_ACCOUNT_CONTAINER
require_env TF_STATE_STORAGE_ACCOUNT_KEY

if ! command -v terraform >/dev/null 2>&1; then
  echo "ERROR: terraform not found. Run: npx nx run github-runner:init" >&2
  exit 1
fi

if ! command -v az >/dev/null 2>&1; then
  echo "ERROR: az CLI not found." >&2
  exit 1
fi

if [[ "$ACTION" == "apply" ]]; then
  if ! command -v gh >/dev/null 2>&1; then
    echo "ERROR: gh CLI not found. Run: npx nx run github-runner:init" >&2
    exit 1
  fi
  if ! gh auth status >/dev/null 2>&1; then
    echo "ERROR: gh is not authenticated. Run: gh auth login" >&2
    exit 1
  fi
fi

if ! az account show >/dev/null 2>&1; then
  echo "az is not logged in, running az login..."
  az login >/dev/null
fi

az account set --subscription "$TF_SUBSCRIPTION_ID" >/dev/null
echo "Active subscription: $(az account show --query name -o tsv) ($TF_SUBSCRIPTION_ID)"

mint_runner_token() {
  local repo_path="${GH_REPO#http://}"
  repo_path="${repo_path#https://}"
  repo_path="${repo_path#github.com/}"
  repo_path="${repo_path%/}"
  repo_path="${repo_path%.git}"

  echo "Minting fresh runner registration token via gh api for ${repo_path}..." >&2
  gh api -X POST "/repos/${repo_path}/actions/runners/registration-token" --jq .token
}

SSH_KEY_PATH="${HOME}/.ssh/id_ed25519"
SSH_PUB_PATH="${SSH_KEY_PATH}.pub"
if [[ ! -f "$SSH_PUB_PATH" ]]; then
  echo "Generating SSH key at $SSH_KEY_PATH (no passphrase)..."
  ssh-keygen -t ed25519 -N "" -f "$SSH_KEY_PATH" -C "spark-sandbox-runner@$(hostname)"
fi
SSH_PUBLIC_KEY="$(cat "$SSH_PUB_PATH")"

TF_DIR="$PROJECT_ROOT/terraform"
STATE_KEY="github-runner-spark-sandbox.tfstate"

echo "=== terraform get -update ==="
terraform -chdir="$TF_DIR" get -update

echo "=== terraform init (backend: $TF_STATE_STORAGE_ACCOUNT_NAME / $TF_STATE_STORAGE_ACCOUNT_CONTAINER / $STATE_KEY) ==="
terraform -chdir="$TF_DIR" init -reconfigure \
  -backend-config="storage_account_name=${TF_STATE_STORAGE_ACCOUNT_NAME}" \
  -backend-config="container_name=${TF_STATE_STORAGE_ACCOUNT_CONTAINER}" \
  -backend-config="key=${STATE_KEY}" \
  -backend-config="access_key=${TF_STATE_STORAGE_ACCOUNT_KEY}"

RUNNER_TOKEN="unused"
if [[ "$ACTION" == "apply" ]]; then
  RUNNER_TOKEN="$(mint_runner_token)"
fi

TF_VARS=(
  -var "subscription_id=${TF_SUBSCRIPTION_ID}"
  -var "resource_group_name=${TF_RESOURCE_GROUP}"
  -var "github_repo=${GH_REPO}"
  -var "github_runner_token=${RUNNER_TOKEN}"
  -var "ssh_public_key=${SSH_PUBLIC_KEY}"
)

case "$ACTION" in
  apply)
    echo "=== terraform apply ==="
    terraform -chdir="$TF_DIR" apply -auto-approve "${TF_VARS[@]}"
    echo ""
    echo "=== terraform outputs ==="
    terraform -chdir="$TF_DIR" output
    echo ""
    echo "=== Next steps ==="
    echo "  1. Wait ~3-5 min for cloud-init to finish, then check the runner here:"
    echo "       ${GH_REPO}/settings/actions/runners"
    echo "  2. SSH (copy/paste from the ssh_via_bastion_hint output above)."
    ;;
  destroy)
    echo "=== terraform destroy ==="
    terraform -chdir="$TF_DIR" destroy -auto-approve "${TF_VARS[@]}"
    ;;
  plan)
    terraform -chdir="$TF_DIR" plan "${TF_VARS[@]}"
    ;;
  output|outputs)
    terraform -chdir="$TF_DIR" output
    ;;
  *)
    echo "Usage: $0 [apply|destroy|plan|output]" >&2
    exit 2
    ;;
esac
