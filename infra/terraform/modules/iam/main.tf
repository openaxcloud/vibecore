resource "google_service_account" "app_gke_nodes" {
  account_id   = "${var.name_prefix}-app-nodes"
  display_name = "VibeCore app GKE nodes"
}

resource "google_service_account" "workspaces_gke_nodes" {
  account_id   = "${var.name_prefix}-workspace-nodes"
  display_name = "VibeCore workspace GKE nodes"
}

resource "google_service_account" "platform_workload" {
  account_id   = "${var.name_prefix}-platform"
  display_name = "VibeCore platform workload identity"
}

resource "google_service_account" "workspace_manager_workload" {
  account_id   = "${var.name_prefix}-workspace-manager"
  display_name = "VibeCore workspace manager workload identity"
}

resource "google_project_iam_member" "node_logging" {
  for_each = toset([
    google_service_account.app_gke_nodes.email,
    google_service_account.workspaces_gke_nodes.email
  ])
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${each.value}"
}

resource "google_project_iam_member" "node_monitoring" {
  for_each = toset([
    google_service_account.app_gke_nodes.email,
    google_service_account.workspaces_gke_nodes.email
  ])
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${each.value}"
}

# workspace-manager talks to the kube-apiserver in-cluster using its mounted
# ServiceAccount token, scoped by the namespaced RBAC Role
# `workspace-manager-runtime` (infra/helm/workspaces-runtime/templates/rbac.yaml).
# It does NOT call the GCP/GKE API, so the project-wide roles/container.developer
# previously granted here was excessive — that GCP role confers read/write/delete
# on Kubernetes objects across EVERY namespace of every cluster in the project.
# `container.viewer` is enough for any cluster-discovery the Workload Identity
# binding needs; all mutating access comes from the namespaced RBAC Role.
resource "google_project_iam_member" "workspace_manager_container" {
  project = var.project_id
  role    = "roles/container.viewer"
  member  = "serviceAccount:${google_service_account.workspace_manager_workload.email}"
}

resource "google_project_iam_member" "platform_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.platform_workload.email}"
}
