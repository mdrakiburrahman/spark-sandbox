#!/bin/bash
#
#
#       Mount/Unmount OneLake Blob Storage container using Blobfuse2.
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
MOUNT_PATH="./onelake"

is_mounted() {
  mountpoint -q "$MOUNT_PATH" 2>/dev/null
}

case "$ACTION" in
  mount)
    if is_mounted; then
      echo "OneLake is already mounted at $MOUNT_PATH"
    else
      mkdir -p "$MOUNT_PATH"
      blobfuse2 mount "$MOUNT_PATH" --config-file=blobfuse-onelake-config.yaml --read-only=true
      echo "OneLake mounted at $MOUNT_PATH"
    fi
    ;;
  unmount)
    if is_mounted; then
      blobfuse2 unmount "$MOUNT_PATH"
      echo "OneLake unmounted from $MOUNT_PATH"
    else
      echo "OneLake is not mounted at $MOUNT_PATH"
    fi
    ;;
  *)
    echo "Usage: $0 [mount|unmount]"
    exit 1
    ;;
esac