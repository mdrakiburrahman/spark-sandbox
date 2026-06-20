#!/bin/bash
#
#
#       Downloads host pkgs that can only be installed after the container
#       is running.
#
# ---------------------------------------------------------------------------------------
#
set -e
set -m

export GIT_ROOT=$(git rev-parse --show-toplevel)
export SCRIPT_DIR=$(realpath $(dirname $0))
source "${SCRIPT_DIR}/common.sh"

cmake_version=$(cmake --version | grep -oP "cmake version \K[0-9]+\.[0-9]+\.[0-9]+")
required_version="3.25.0"
if [ "$cmake_version" != "$required_version" ]; then
    echo "CMake version $cmake_version found. Upgrading to $required_version"
    sudo apt remove -y cmake
    retry pip install cmake==$required_version --upgrade
fi
cmake_location=$(pip show cmake | grep Location | awk '{print $2}')

if pip show fabric &>/dev/null; then
    echo "Removing conflicting 'fabric' (SSH) package from here https://github.com/fabric/fabric/issues/1830..."
    pip uninstall fabric -y
fi

if ! command -v fab &>/dev/null; then
    echo "fab cli not found. installing..."
    retry pip install ms-fabric-cli==1.0.1 --upgrade
fi

fabric_cicd_version=$(pip show fabric-cicd 2>/dev/null | grep Version | awk '{print $2}' || echo "")

if [ "$fabric_cicd_version" != "1.1.0" ]; then
    pip uninstall fabric-cicd -y 2>/dev/null || true
    pip cache purge
    retry pip install fabric-cicd==1.1.0 --upgrade
fi

fabric_deploy_installed=$(pip show fabric-workspace-deployment 2>/dev/null | grep Location | awk '{print $2}' || echo "")
if [ -z "$fabric_deploy_installed" ]; then
    retry pip install "fabric-workspace-deployment @ git+https://github.com/mdrakiburrahman/fabric-workspace-deployment.git@2c0f418"
fi

fabric_deploy_location=$(pip show fabric-workspace-deployment 2>/dev/null | grep Location | awk '{print $2}')

echo "7-Zip: $(7z --help | grep -oP "Version \d+\.\d+")"
echo "CMake: $(cmake --version | head -n 1)"
echo "Fabric CLI version: $(fab version)"
echo "Fabric Deploy location: ${fabric_deploy_location}"