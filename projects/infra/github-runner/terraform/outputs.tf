output "resource_group_name" {
  description = "Resource group containing all runner infrastructure"
  value       = module.github_runner.resource_group_name
}

output "location" {
  description = "Azure region"
  value       = module.github_runner.location
}

output "vnet_name" {
  description = "Virtual network name"
  value       = module.github_runner.vnet_name
}

output "vmss_name" {
  description = "VMSS name"
  value       = module.github_runner.vmss_name
}

output "vmss_resource_id" {
  description = "VMSS resource ID"
  value       = module.github_runner.vmss_resource_id
}

output "bastion_name" {
  description = "Azure Bastion host name"
  value       = module.github_runner.bastion_name
}

output "bastion_resource_id" {
  description = "Azure Bastion resource ID"
  value       = module.github_runner.bastion_resource_id
}

output "ssh_via_bastion_hint" {
  description = "Sample command to SSH into the first VMSS instance via Bastion"
  value       = module.github_runner.ssh_via_bastion_hint
}

output "tunnel_via_bastion_hint" {
  description = "Sample command to open a local tunnel to the first VMSS instance via Bastion"
  value       = module.github_runner.tunnel_via_bastion_hint
}
