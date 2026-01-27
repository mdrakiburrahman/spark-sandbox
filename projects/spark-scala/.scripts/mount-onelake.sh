#!/bin/bash
#
#
#       Mount/Unmount OneLake Blob Storage containers using Blobfuse2.
#       Reads lakehouse mappings from lakehouse-mapping.csv and mounts each.
#
#       Usage: ./mount-onelake.sh [mount|unmount]
#
# ---------------------------------------------------------------------------------------
#
# Fail fast
#
set -e

export GIT_ROOT=$(git rev-parse --show-toplevel)
export SPARK_SCALA_DIR="${GIT_ROOT}/projects/spark-scala"

cd ${SPARK_SCALA_DIR}

ACTION=${1:-mount}
MOUNT_BASE_PATH="./onelake"
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
  local mount_path="${MOUNT_BASE_PATH}/${lakehouse_name}"
  local config_file="${TEMP_DIR}/blobfuse-onelake-config.${lakehouse_name}.yaml"

  if is_mounted "$mount_path"; then
    echo "✓ ${lakehouse_name} is already mounted at ${mount_path}"
    return 0
  fi

  mkdir -p "${TEMP_DIR}"
  sed -e "s/\${ONELAKE_SUBDIRECTORY}/${lakehouse_guid}/g" \
      -e "s/\${ONELAKE_LAKEHOUSE}/${lakehouse_name}/g" "${TEMPLATE_FILE}" > "${config_file}"
  mkdir -p "${mount_path}"
  blobfuse2 mount "${mount_path}" --config-file="${config_file}" --read-only=true
  echo "- ${lakehouse_name} mounted at ${mount_path}"
}

unmount_lakehouse() {
  local lakehouse_name="$1"
  local mount_path="${MOUNT_BASE_PATH}/${lakehouse_name}"

  if is_mounted "$mount_path"; then
    blobfuse2 unmount "$mount_path"
    echo "- ${lakehouse_name} unmounted from ${mount_path}"
  else
    echo "- ${lakehouse_name} is not mounted at ${mount_path}"
  fi
}

# Read CSV and process each lakehouse (skip header)
process_lakehouses() {
  local action="$1"

  if [[ ! -f "${CSV_FILE}" ]]; then
    echo "Error: ${CSV_FILE} not found"
    exit 1
  fi

  tail -n +2 "${CSV_FILE}" | while IFS=',' read -r lakehouse_name lakehouse_guid; do
  
    lakehouse_name=$(echo "$lakehouse_name" | xargs)
    lakehouse_guid=$(echo "$lakehouse_guid" | xargs)

    if [[ -z "$lakehouse_name" || -z "$lakehouse_guid" ]]; then
      continue
    fi

    case "$action" in
      mount)
        mount_lakehouse "$lakehouse_name" "$lakehouse_guid"
        ;;
      unmount)
        unmount_lakehouse "$lakehouse_name"
        ;;
    esac
  done
}

show_tree() {
  local lakehouse_name="$1"
  local mount_path="${MOUNT_BASE_PATH}/${lakehouse_name}"

  if is_mounted "$mount_path"; then
    echo ""
    echo "📂 ${lakehouse_name}:"
    tree -L 2 "${mount_path}"
  fi
}

case "$ACTION" in
  mount)
    echo "Mounting OneLake lakehouses..."
    process_lakehouses "mount"
    echo ""
    echo "Displaying mounted lakehouses..."
    tail -n +2 "${CSV_FILE}" | while IFS=',' read -r lakehouse_name lakehouse_guid; do
      lakehouse_name=$(echo "$lakehouse_name" | xargs)
      if [[ -n "$lakehouse_name" ]]; then
        show_tree "$lakehouse_name"
      fi
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