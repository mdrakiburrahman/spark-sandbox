#!/bin/bash

# Downloads the azcopy utility.
#
# See: https://docs.microsoft.com/en-us/azure/storage/common/storage-use-azcopy-v10
#
# Downloading this directly allows all nx steps to take a dependency on this before
# running azcopy commands. If multiple steps try to download it, the OS throws.
#
# Usage:
#   ./get-azcopy.sh dest_dir
#

set -euo pipefail
trap '>&2 echo "Error at line $LINENO (process exited with code $?)"' ERR

if [[ $# -ne 1 ]]; then
    echo >&2 "Invalid or missing argument(s)"
    exit 1
fi

dest_dir=$(realpath -m $1)
mkdir -p $dest_dir

if [[ -f "$dest_dir/azcopy" ]]; then
    echo "Found azcopy at: $dest_dir/azcopy"
    exit 0
fi

tmp_dir=$(mktemp -d /tmp/azcopyXXXXXX)
trap 'rm -rf $tmp_dir' EXIT

pushd $tmp_dir >/dev/null

echo "Downloading azcopy"
wget --no-verbose -O azcopy.tar.gz https://aka.ms/downloadazcopy-v10-linux
tar -xf azcopy.tar.gz
azcopy=$(find . -name azcopy -executable -type f | head -n 1)

echo "Installing: $azcopy -> $dest_dir"
mv $azcopy $dest_dir

popd >/dev/null
