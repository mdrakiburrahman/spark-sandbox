terraform {
  backend "azurerm" {
    # Partial backend — populated by .scripts/deploy-gh-runner.sh from .env:
    #   storage_account_name, container_name, key, access_key
  }
}
