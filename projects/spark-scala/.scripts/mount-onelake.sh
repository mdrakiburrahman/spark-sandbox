#!/bin/bash
#
#
#       Mount/Unmount OneLake Blob Storage containers using Blobfuse2.
#       Reads lakehouse mappings from lakehouse-mapping.csv and mounts each.
#
#       Requires IMDS Router to be running for mocked MSI auth.
#       The --read-only flag is REQUIRED to prevent accidental writes/deletes to OneLake.
#       File permissions are set via libfuse config to allow read access for all users.
#
#       Usage: ./mount-onelake.sh [mount|unmount]
#
# ---------------------------------------------------------------------------------------
set -e

export GIT_ROOT=$(git rev-parse --show-toplevel)
export SPARK_SCALA_DIR="${GIT_ROOT}/projects/spark-scala"

cd ${SPARK_SCALA_DIR}

export IDENTITY_ENDPOINT="${IDENTITY_ENDPOINT:-http://localhost:6020/token}"
export IDENTITY_HEADER="${IDENTITY_HEADER:-local-dev-secret}"
export ONELAKE_WORKSPACE_ID="58374f03-58b3-48f8-ae96-758f86aed72d"

ACTION=${1:-mount}
MOUNT_BASE_PATH="/tmp/.mnt/onelake"
TEMPLATE_FILE="blobfuse-onelake-config.yaml.tmpl"
TEMP_DIR=".temp"
CSV_FILE="lakehouse-mapping.csv"

is_mounted() {
  local path="$1"
  mountpoint -q "$path" 2>/dev/null
}

mount_lakehouse() {
  local lakehouse_name="$1"
  local lakehouse_guid="$2"
  local folder_to_mount="$3"
  local mount_path="${MOUNT_BASE_PATH}/${lakehouse_name}"
  local config_file="${TEMP_DIR}/blobfuse-onelake-config.${lakehouse_name}.yaml"

  if is_mounted "$mount_path"; then
    echo "${lakehouse_name} is already mounted at ${mount_path}"
    return 0
  fi

  mkdir -p "${TEMP_DIR}"
  export ONELAKE_SUBDIRECTORY="${lakehouse_guid}/${folder_to_mount}"
  export ONELAKE_LAKEHOUSE="$lakehouse_name"
  envsubst < "${TEMPLATE_FILE}" > "${config_file}"
  mkdir -p "${mount_path}"
  blobfuse2 mount "${mount_path}" --config-file="${config_file}" --read-only=true --allow-other
  echo "- ${lakehouse_name} mounted at ${mount_path}"
}

unmount_lakehouse() {
  local lakehouse_name="$1"
  local mount_path="${MOUNT_BASE_PATH}/${lakehouse_name}"

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
}

process_lakehouses() {
  local action="$1"

  if [[ ! -f "${CSV_FILE}" ]]; then
    echo "Error: ${CSV_FILE} not found"
    exit 1
  fi

  tail -n +2 "${CSV_FILE}" | while IFS=',' read -r lakehouse_name lakehouse_guid folder_to_mount; do
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

show_tree() {
  local lakehouse_name="$1"
  local mount_path="${MOUNT_BASE_PATH}/${lakehouse_name}"

  if is_mounted "$mount_path"; then
    echo ""
    echo "📂 ${lakehouse_name}:"
    tree -L 1 "${mount_path}"
  fi
}

case "$ACTION" in
  mount)
    echo "Mounting OneLake lakehouses via IMDS Router (App Service MSI mode)..."
    echo "IDENTITY_ENDPOINT=${IDENTITY_ENDPOINT}"
    echo "IDENTITY_HEADER=${IDENTITY_HEADER}"
    process_lakehouses "mount"
    echo ""
    echo "Displaying mounted lakehouses..."
    tail -n +2 "${CSV_FILE}" | while IFS=',' read -r lakehouse_name lakehouse_guid folder_to_mount; do
      lakehouse_name=$(echo "$lakehouse_name" | xargs)
      [[ -n "$lakehouse_name" ]] && show_tree "$lakehouse_name"
    done
    echo ""
    echo "Done."
    ;;
  unmount)
    echo "Unmounting OneLake lakehouses..."
    process_lakehouses "unmount"
    echo "Done."
    ;;
  *)
    echo "Usage: $0 [mount|unmount]"
    exit 1
    ;;
esac