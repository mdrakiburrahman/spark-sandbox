#!/bin/bash
#
#
#       Mount/Unmount OneLake and ADLS Gen2 Blob Storage containers using Blobfuse2.
#       Reads lakehouse mappings from mount-lakehouse-mapping.csv and ADLS Gen2 account
#       mappings from mount-adls-mapping.csv, mounting each.
#
#       Requires IMDS Router to be running for mocked MSI auth. Each mount passes the
#       storage account/container/endpoint to the router via IDENTITY_ENDPOINT query
#       params so it can route to the right credential (default `az` vs SNI cert).
#
#       The --read-only flag is REQUIRED to prevent accidental writes/deletes.
#       File permissions are set via libfuse config to allow read access for all users.
#
#       Usage: ./mount-onelake.sh [mount|unmount]
#
# ---------------------------------------------------------------------------------------
set -e

export GIT_ROOT=$(git rev-parse --show-toplevel)
export SPARK_SCALA_DIR="${GIT_ROOT}/projects/spark-scala"

cd ${SPARK_SCALA_DIR}

export IDENTITY_ENDPOINT="http://localhost:6020/token"
export IDENTITY_HEADER="local-dev-secret"
export ONELAKE_WORKSPACE_ID="3ea60ae5-e979-4d31-a317-66491ab497fb"

ACTION=${1:-mount}
TEMP_DIR=".temp"

# OneLake config
ONELAKE_MOUNT_BASE="/tmp/.mnt/onelake"
ONELAKE_TEMPLATE="blobfuse-onelake-config.yaml.tmpl"
ONELAKE_CSV="mount-lakehouse-mapping.csv"

# ADLS Gen2 config
ADLS_MOUNT_BASE="/tmp/.mnt/adls"
ADLS_TEMPLATE="blobfuse-adls-config.yaml.tmpl"
ADLS_CSV="mount-adls-mapping.csv"

is_mounted() {
  local path="$1"
  mountpoint -q "$path" 2>/dev/null
}

mount_metadata() {
  local config_file="$1"
  local account container endpoint
  account=$(yq e '.azstorage."account-name"' "$config_file")
  container=$(yq e '.azstorage.container' "$config_file")
  endpoint=$(yq e '.azstorage.endpoint' "$config_file")
  printf 'account=%s&container=%s&endpoint=%s' "$account" "$container" "$endpoint"
}

# --- OneLake ---

mount_lakehouse() {
  local lakehouse_name="$1"
  local lakehouse_guid="$2"
  local folder_to_mount="$3"
  local mount_path="${ONELAKE_MOUNT_BASE}/${lakehouse_name}"
  local config_file="${TEMP_DIR}/blobfuse-onelake-config.${lakehouse_name}.yaml"

  if is_mounted "$mount_path"; then
    echo "${lakehouse_name} is already mounted at ${mount_path}"
    return 0
  fi

  mkdir -p "${TEMP_DIR}"
  export ONELAKE_SUBDIRECTORY="${lakehouse_guid}/${folder_to_mount}"
  export ONELAKE_LAKEHOUSE="$lakehouse_name"
  envsubst < "${ONELAKE_TEMPLATE}" > "${config_file}"
  mkdir -p "${mount_path}"
  IDENTITY_ENDPOINT="${IDENTITY_ENDPOINT}?$(mount_metadata "${config_file}")" \
    blobfuse2 mount "${mount_path}" --config-file="${config_file}" --read-only=true --allow-other
  echo "- ${lakehouse_name} mounted at ${mount_path}"
}

unmount_lakehouse() {
  local lakehouse_name="$1"
  local mount_path="${ONELAKE_MOUNT_BASE}/${lakehouse_name}"

  if is_mounted "$mount_path"; then
    if blobfuse2 unmount "$mount_path" 2>/dev/null; then
      echo "- ${lakehouse_name} unmounted from ${mount_path}"
    else
      echo "- ${lakehouse_name} busy, forcing lazy unmount..."
      fusermount3 -uz "$mount_path" || fusermount -uz "$mount_path"
      echo "- ${lakehouse_name} lazy-unmounted from ${mount_path}"
    fi
  else
    echo "- ${lakehouse_name} is not mounted at ${mount_path}"
  fi
  rm -rf ${mount_path}
}

process_lakehouses() {
  local action="$1"

  if [[ ! -f "${ONELAKE_CSV}" ]]; then
    echo "Warning: ${ONELAKE_CSV} not found, skipping OneLake mounts"
    return 0
  fi

  tail -n +2 "${ONELAKE_CSV}" | while IFS=',' read -r lakehouse_name lakehouse_guid folder_to_mount || [[ -n "$lakehouse_name" ]]; do
    lakehouse_name=$(echo "$lakehouse_name" | xargs)
    lakehouse_guid=$(echo "$lakehouse_guid" | xargs)
    folder_to_mount=$(echo "$folder_to_mount" | xargs)

    if [[ -z "$lakehouse_name" || -z "$lakehouse_guid" ]]; then
      continue
    fi

    case "$action" in
      mount)   mount_lakehouse "$lakehouse_name" "$lakehouse_guid" "$folder_to_mount" ;;
      unmount) unmount_lakehouse "$lakehouse_name" ;;
    esac
  done
}

# --- ADLS Gen2 ---

mount_adls() {
  local account_name="$1"
  local container_name="$2"
  local mount_path="${ADLS_MOUNT_BASE}/${account_name}"
  local config_file="${TEMP_DIR}/blobfuse-adls-config.${account_name}.yaml"

  if is_mounted "$mount_path"; then
    echo "${account_name} is already mounted at ${mount_path}"
    return 0
  fi

  mkdir -p "${TEMP_DIR}"
  export ADLS_ACCOUNT_NAME="${account_name}"
  export ADLS_CONTAINER_NAME="${container_name}"
  envsubst < "${ADLS_TEMPLATE}" > "${config_file}"
  mkdir -p "${mount_path}"
  IDENTITY_ENDPOINT="${IDENTITY_ENDPOINT}?$(mount_metadata "${config_file}")" \
    blobfuse2 mount "${mount_path}" --config-file="${config_file}" --read-only=true --allow-other
  echo "- ${account_name} mounted at ${mount_path}"
}

unmount_adls() {
  local account_name="$1"
  local mount_path="${ADLS_MOUNT_BASE}/${account_name}"

  if is_mounted "$mount_path"; then
    if blobfuse2 unmount "$mount_path" 2>/dev/null; then
      echo "- ${account_name} unmounted from ${mount_path}"
    else
      echo "- ${account_name} busy, forcing lazy unmount..."
      fusermount3 -uz "$mount_path" || fusermount -uz "$mount_path"
      echo "- ${account_name} lazy-unmounted from ${mount_path}"
    fi
  else
    echo "- ${account_name} is not mounted at ${mount_path}"
  fi
  rm -rf ${mount_path}
}

process_adls_accounts() {
  local action="$1"

  if [[ ! -f "${ADLS_CSV}" ]]; then
    echo "Warning: ${ADLS_CSV} not found, skipping ADLS mounts"
    return 0
  fi

  tail -n +2 "${ADLS_CSV}" | while IFS=',' read -r account_name container_name || [[ -n "$account_name" ]]; do
    account_name=$(echo "$account_name" | xargs)
    container_name=$(echo "$container_name" | xargs)

    if [[ -z "$account_name" || -z "$container_name" ]]; then
      continue
    fi

    case "$action" in
      mount)   mount_adls "$account_name" "$container_name" ;;
      unmount) unmount_adls "$account_name" ;;
    esac
  done
}

# --- Display ---

show_tree() {
  local label="$1"
  local mount_path="$2"

  if is_mounted "$mount_path"; then
    echo ""
    echo "📂 ${label}:"
    tree -L 1 "${mount_path}"
  fi
}

# --- Main ---

case "$ACTION" in
  mount)
    echo "Mounting storage via IMDS Router (App Service MSI mode)..."
    echo "IDENTITY_ENDPOINT=${IDENTITY_ENDPOINT}"
    echo "IDENTITY_HEADER=${IDENTITY_HEADER}"

    echo ""
    echo "=== OneLake Lakehouses ==="
    process_lakehouses "mount"

    echo ""
    echo "=== ADLS Gen2 Accounts ==="
    process_adls_accounts "mount"

    echo ""
    echo "Displaying mounted storage..."
    if [[ -f "${ONELAKE_CSV}" ]]; then
      tail -n +2 "${ONELAKE_CSV}" | while IFS=',' read -r lakehouse_name lakehouse_guid folder_to_mount || [[ -n "$lakehouse_name" ]]; do
        lakehouse_name=$(echo "$lakehouse_name" | xargs)
        [[ -n "$lakehouse_name" ]] && show_tree "$lakehouse_name" "${ONELAKE_MOUNT_BASE}/${lakehouse_name}"
      done
    fi
    if [[ -f "${ADLS_CSV}" ]]; then
      tail -n +2 "${ADLS_CSV}" | while IFS=',' read -r account_name container_name || [[ -n "$account_name" ]]; do
        account_name=$(echo "$account_name" | xargs)
        [[ -n "$account_name" ]] && show_tree "$account_name" "${ADLS_MOUNT_BASE}/${account_name}"
      done
    fi
    echo ""
    echo "Done."
    ;;
  unmount)
    echo "Unmounting storage..."
    process_lakehouses "unmount"
    process_adls_accounts "unmount"
    echo "Done."
    ;;
  *)
    echo "Usage: $0 [mount|unmount]"
    exit 1
    ;;
esac
