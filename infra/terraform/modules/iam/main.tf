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

data "google_project" "current" {
  project_id = var.project_id
}

locals {
  server_deploy_builder_enabled = var.server_deploy_builder_repository != null && var.server_deploy_cosign_kms_key_id != ""
  server_deploy_builder_repository = var.server_deploy_builder_repository != null ? var.server_deploy_builder_repository : {
    project    = ""
    location   = ""
    repository = ""
  }
}

# Dedicated identity for untrusted per-app builds. Never fall back to the
# project's default Compute Engine/Cloud Build service account.
resource "google_service_account" "server_deploy_builder" {
  count        = local.server_deploy_builder_enabled ? 1 : 0
  account_id   = "${var.name_prefix}-app-builder"
  display_name = "VibeCore server deploy image builder"
}

# KMS-capable identity for platform-authored signing steps only. It never reads
# the user source bucket and is distinct from the untrusted Docker builder.
resource "google_service_account" "server_deploy_signer" {
  count        = local.server_deploy_builder_enabled ? 1 : 0
  account_id   = "${var.name_prefix}-app-signer"
  display_name = "VibeCore trusted app image signer"
}

resource "google_project_iam_member" "node_logging" {
  # Keep the historical email-shaped instance keys while making them known at
  # plan time. This avoids both a two-phase bootstrap and state-address churn.
  for_each = {
    "${var.name_prefix}-app-nodes@${var.project_id}.iam.gserviceaccount.com"       = google_service_account.app_gke_nodes.email
    "${var.name_prefix}-workspace-nodes@${var.project_id}.iam.gserviceaccount.com" = google_service_account.workspaces_gke_nodes.email
  }
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${each.value}"
}

resource "google_project_iam_member" "node_monitoring" {
  for_each = {
    "${var.name_prefix}-app-nodes@${var.project_id}.iam.gserviceaccount.com"       = google_service_account.app_gke_nodes.email
    "${var.name_prefix}-workspace-nodes@${var.project_id}.iam.gserviceaccount.com" = google_service_account.workspaces_gke_nodes.email
  }
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${each.value}"
}

# Read-only Artifact Registry access so the nodes can still PULL container images
# once their OAuth scope is narrowed off cloud-platform to the GKE-default set
# (devstorage.read_only). Additive + non-disruptive — apply this BEFORE the
# node-pool scope change so image pulls never break.
resource "google_project_iam_member" "node_artifact_registry_reader" {
  for_each = {
    "${var.name_prefix}-app-nodes@${var.project_id}.iam.gserviceaccount.com"       = google_service_account.app_gke_nodes.email
    "${var.name_prefix}-workspace-nodes@${var.project_id}.iam.gserviceaccount.com" = google_service_account.workspaces_gke_nodes.email
  }
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

# Reproduce the live KSA→GSA Workload Identity binding in IaC. The API uses ADC;
# no service-account JSON key is generated or mounted.
resource "google_service_account_iam_member" "platform_api_workload_identity" {
  service_account_id = google_service_account.platform_workload.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[vibecore/vibecore-vibecore-platform-api]"
}

# The API submits, reconciles, polls and cancels per-app Cloud Builds. Image
# signing executes in the distinct trusted signer build; editor is required by
# the durable crash-recovery and hard-delete cancellation paths (never a default SA).
resource "google_project_iam_member" "platform_cloud_build_submitter" {
  count   = local.server_deploy_builder_enabled ? 1 : 0
  project = var.project_id
  role    = "roles/cloudbuild.builds.editor"
  member  = "serviceAccount:${google_service_account.platform_workload.email}"
}

# Cloud Build requires the caller to actAs the explicitly selected build GSA.
resource "google_service_account_iam_member" "platform_server_deploy_builder_act_as" {
  count              = local.server_deploy_builder_enabled ? 1 : 0
  service_account_id = google_service_account.server_deploy_builder[0].name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.platform_workload.email}"
}

resource "google_service_account_iam_member" "platform_server_deploy_signer_act_as" {
  count              = local.server_deploy_builder_enabled ? 1 : 0
  service_account_id = google_service_account.server_deploy_signer[0].name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.platform_workload.email}"
}

# With a user-specified build identity, the Google-managed Cloud Build service
# agent must mint that identity's short-lived token. Scope this exact principal
# to each build GSA; no project-wide TokenCreator grant is used.
resource "google_service_account_iam_member" "cloud_build_agent_builder_token_creator" {
  count              = local.server_deploy_builder_enabled ? 1 : 0
  service_account_id = google_service_account.server_deploy_builder[0].name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-cloudbuild.iam.gserviceaccount.com"
}

resource "google_service_account_iam_member" "cloud_build_agent_signer_token_creator" {
  count              = local.server_deploy_builder_enabled ? 1 : 0
  service_account_id = google_service_account.server_deploy_signer[0].name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:service-${data.google_project.current.number}@gcp-sa-cloudbuild.iam.gserviceaccount.com"
}

# The builder reads dynamic per-project source-context buckets in this project.
# It cannot mutate those buckets; output is written only to its scoped AR repo.
resource "google_project_iam_member" "server_deploy_builder_source_reader" {
  count   = local.server_deploy_builder_enabled ? 1 : 0
  project = var.project_id
  role    = "roles/storage.objectViewer"
  member  = "serviceAccount:${google_service_account.server_deploy_builder[0].email}"
}

resource "google_project_iam_member" "server_deploy_builder_log_writer" {
  count   = local.server_deploy_builder_enabled ? 1 : 0
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.server_deploy_builder[0].email}"
}

resource "google_project_iam_member" "server_deploy_signer_log_writer" {
  count   = local.server_deploy_builder_enabled ? 1 : 0
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.server_deploy_signer[0].email}"
}

# Source image writes are repository-scoped; tenant target repositories remain
# inaccessible to the builder and are written only by the promotion runtime.
resource "google_artifact_registry_repository_iam_member" "server_deploy_builder_writer" {
  count      = local.server_deploy_builder_enabled ? 1 : 0
  project    = local.server_deploy_builder_repository.project
  location   = local.server_deploy_builder_repository.location
  repository = local.server_deploy_builder_repository.repository
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.server_deploy_builder[0].email}"
}

resource "google_artifact_registry_repository_iam_member" "server_deploy_signer_writer" {
  count      = local.server_deploy_builder_enabled ? 1 : 0
  project    = local.server_deploy_builder_repository.project
  location   = local.server_deploy_builder_repository.location
  repository = local.server_deploy_builder_repository.repository
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.server_deploy_signer[0].email}"
}

# Base/runtime images can live in repositories distinct from the app-build
# output repository. Grant pull only on the explicitly declared repositories.
resource "google_artifact_registry_repository_iam_member" "server_deploy_builder_reader" {
  for_each = local.server_deploy_builder_enabled ? {
    for repository in var.server_deploy_builder_pull_repositories :
    "${repository.project}/${repository.location}/${repository.repository}" => repository
  } : {}

  project    = each.value.project
  location   = each.value.location
  repository = each.value.repository
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.server_deploy_builder[0].email}"
}

# KMS scope is the one asymmetric signing key, never project-wide.
resource "google_kms_crypto_key_iam_member" "server_deploy_trusted_signer" {
  count         = local.server_deploy_builder_enabled ? 1 : 0
  crypto_key_id = var.server_deploy_cosign_kms_key_id
  role          = "roles/cloudkms.signerVerifier"
  member        = "serviceAccount:${google_service_account.server_deploy_signer[0].email}"
}

resource "google_kms_crypto_key_iam_member" "server_deploy_trusted_signer_viewer" {
  count         = local.server_deploy_builder_enabled ? 1 : 0
  crypto_key_id = var.server_deploy_cosign_kms_key_id
  role          = "roles/cloudkms.viewer"
  member        = "serviceAccount:${google_service_account.server_deploy_signer[0].email}"
}

# Least-privilege, repository-scoped data-plane grants. Every repository that
# can contain a p-<project> package needs repoAdmin: promotion rollback and the
# permanent-delete saga both require deleteArtifacts after an exact inventory.
resource "google_artifact_registry_repository_iam_member" "artifact_promotion" {
  for_each = {
    for grant in var.artifact_promotion_repositories :
    "${grant.project}/${grant.location}/${grant.repository}/${grant.role}" => grant
  }

  project    = each.value.project
  location   = each.value.location
  repository = each.value.repository
  role       = each.value.role
  member     = "serviceAccount:${google_service_account.platform_workload.email}"
}

resource "google_project_iam_member" "binary_authorization_evaluator" {
  for_each = var.binary_authorization_policy_projects
  project  = each.value
  role     = "roles/binaryauthorization.policyEvaluator"
  member   = "serviceAccount:${google_service_account.platform_workload.email}"
}
