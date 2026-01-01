#!/bin/bash
#
#
#       Bootstraps a Linux Devbox host for the VS Code devcontainer idempotently.
#       If your Devbox restarts, rerun this script.
#
# ---------------------------------------------------------------------------------------
#

DOCKER_VERSION="5:27.5.1-1~ubuntu.24.04~noble"

if ! [ -x "$(command -v docker)" ]; then
  echo "docker is not installed on your devbox, installing..."
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
  sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
  sudo apt-get update -q
  sudo apt-get install -y apt-transport-https ca-certificates curl
  sudo apt-get install -y --allow-downgrades docker-ce="$DOCKER_VERSION" docker-ce-cli="$DOCKER_VERSION" containerd.io
else
  echo "docker is already installed."
fi

sudo chmod 666 /var/run/docker.sock
docker container ls
docker ps -q | xargs -r docker kill

echo "Docker: $(docker --version)"