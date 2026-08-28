output "app_gke_node_service_account" { value = google_service_account.app_gke_nodes.email }
output "workspaces_gke_node_service_account" { value = google_service_account.workspaces_gke_nodes.email }
output "platform_workload_service_account" { value = google_service_account.platform_workload.email }
output "workspace_volume_erasure_service_account" { value = google_service_account.workspace_volume_erasure.email }
output "server_deploy_builder_service_account" {
  value = try(google_service_account.server_deploy_builder[0].email, null)
}
output "server_deploy_signer_service_account" {
  value = try(google_service_account.server_deploy_signer[0].email, null)
}
