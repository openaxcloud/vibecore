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

# Read-only Artifact Registry access so the nodes can still PULL container images
# once their OAuth scope is narrowed off cloud-platform to the GKE-default set
# (devstorage.read_only). Additive + non-disruptive — apply this BEFORE the
# node-pool scope change so image pulls never break.
resource "google_project_iam_member" "node_artifact_registry_reader" {
  for_each = toset([
    google_service_account.app_gke_nodes.email,
    google_service_account.workspaces_gke_nodes.email
  ])
  project = var.project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${each.value}"
}

# workspace-manager talks to the kube-apiserver in-cluster using its mounted
# ServiceAccount token, scoped by the namespaced RBAC Role
# `workspace-manager-runtime` (infra/helm/workspaces-runtime/templates/rbac.yaml).
# It does NOT call the GCP/GKE API and is NOT bound to a GCP service account via
# Workload Identity (global.workloadIdentity.workspaceManager is '' in
# values-prod.yaml). The previously-declared `vibecore-prod-workspace-manager`
# GSA + its container.viewer grant were therefore dead config — never applied
# (the 31-char account_id also exceeds GCP's 30-char limit) and never referenced
# by any KSA annotation or workloadIdentityUser binding. Removed so a clean
# `terraform apply` is unblocked and no unused privileged SA is created. All of
# the manager's mutating access comes from the namespaced RBAC Role.

resource "google_project_iam_member" "platform_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.platform_workload.email}"
}

# --- Workspace snapshot storage (Workload Identity) --------------------------
# Re-introduces a workspace-manager GSA, but ONLY for the snapshot store and ONLY
# when enabled (the earlier GSA was removed as dead config; the manager still
# uses in-cluster RBAC for the kube-apiserver). Account id stays <=30 chars.
resource "google_service_account" "workspace_manager_snapshots" {
  count        = var.enable_workspace_snapshot_wi ? 1 : 0
  account_id   = "${var.name_prefix}-wsmgr-snap"
  display_name = "VibeCore workspace-manager snapshot storage"
}

# objectAdmin (not project-wide) on just the snapshots bucket: read/write/delete
# the workspace archive blobs, nothing else.
resource "google_storage_bucket_iam_member" "workspace_manager_snapshots" {
  count  = var.enable_workspace_snapshot_wi ? 1 : 0
  bucket = var.snapshots_bucket_name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.workspace_manager_snapshots[0].email}"
}

# Let the workspace-manager Kubernetes SA impersonate the GSA via Workload
# Identity. The KSA must be annotated iam.gke.io/gcp-service-account=<gsa email>
# (set global.workloadIdentity.workspaceManager in helm values to this output).
resource "google_service_account_iam_member" "workspace_manager_snapshots_wi" {
  count              = var.enable_workspace_snapshot_wi ? 1 : 0
  service_account_id = google_service_account.workspace_manager_snapshots[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[${var.workspace_manager_namespace}/${var.workspace_manager_ksa}]"
}
