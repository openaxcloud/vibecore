output "app_gke_node_service_account" { value = google_service_account.app_gke_nodes.email }
output "workspaces_gke_node_service_account" { value = google_service_account.workspaces_gke_nodes.email }
output "platform_workload_service_account" { value = google_service_account.platform_workload.email }

output "workspace_manager_snapshots_service_account" {
  value       = var.enable_workspace_snapshot_wi ? google_service_account.workspace_manager_snapshots[0].email : ""
  description = "GSA email for workspace-manager snapshot storage; set helm global.workloadIdentity.workspaceManager to this."
}
