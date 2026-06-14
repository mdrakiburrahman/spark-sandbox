module "github_runner" {
  source = "git::https://github.com/KangarooKube/terraform-infrastructure-modules.git//modules/github-runner/azure-vmss?ref=02e981ebdfa3367a056d4245443f227fc06d71c0"

  resource_group_name = var.resource_group_name
  location            = var.location
  name_prefix         = "spark-sandbox"
  github_repo         = var.github_repo
  github_runner_token = var.github_runner_token
  ssh_public_key      = var.ssh_public_key
  runner_labels       = ["spark-sandbox-azure"]
  instance_sku        = var.instance_sku
  instance_count      = var.instance_count
  tags = {
    project = "spark-sandbox"
    purpose = "github-actions-runner"
    managed = "terraform"
  }
}
