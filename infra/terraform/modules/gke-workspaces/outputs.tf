output "cluster_name" { value = google_container_cluster.workspaces.name }
output "endpoint" { value = google_container_cluster.workspaces.endpoint }

output "workspace_snapshot_policy_name" {
  description = "Nom de la resource policy de snapshots planifiés (à attacher aux PD workspaces)."
  value       = var.snapshot_schedule.enabled ? google_compute_resource_policy.workspace_snapshots[0].name : ""
}
