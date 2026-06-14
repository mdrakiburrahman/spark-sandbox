#!/bin/bash
set -euo pipefail

TERRAFORM_VERSION="1.12.1"
GH_CLI_VERSION="2.94.0"

install_terraform() {
  if command -v terraform &>/dev/null; then
    current=$(terraform version -json 2>/dev/null | grep -oP '"terraform_version":\s*"\K[^"]+' || terraform version | head -1 | grep -oP 'v\K[0-9.]+')
    if [[ "$current" == "$TERRAFORM_VERSION" ]]; then
      echo "terraform $TERRAFORM_VERSION already installed"
      return
    fi
  fi

  echo "Installing terraform $TERRAFORM_VERSION..."
  local tmp
  tmp=$(mktemp -d)
  curl -fsSL "https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}/terraform_${TERRAFORM_VERSION}_linux_amd64.zip" -o "$tmp/terraform.zip"
  unzip -o -q "$tmp/terraform.zip" -d "$tmp"
  sudo install -m 0755 "$tmp/terraform" /usr/local/bin/terraform
  rm -rf "$tmp"
  echo "terraform $(terraform version | head -1) installed"
}

install_gh() {
  if command -v gh &>/dev/null; then
    current=$(gh version | head -1 | grep -oP '[0-9]+\.[0-9]+\.[0-9]+')
    if [[ "$current" == "$GH_CLI_VERSION" ]]; then
      echo "gh $GH_CLI_VERSION already installed"
      return
    fi
  fi

  echo "Installing gh CLI $GH_CLI_VERSION..."
  local tmp
  tmp=$(mktemp -d)
  curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_CLI_VERSION}/gh_${GH_CLI_VERSION}_linux_amd64.tar.gz" -o "$tmp/gh.tar.gz"
  tar -xzf "$tmp/gh.tar.gz" -C "$tmp"
  sudo install -m 0755 "$tmp/gh_${GH_CLI_VERSION}_linux_amd64/bin/gh" /usr/local/bin/gh
  rm -rf "$tmp"
  echo "gh $(gh version | head -1) installed"
}

install_terraform
install_gh
