# Ephemeral audit test environment.
#
# Deliberately NOT the shared root module (`infra/terraform`): that module is
# hard-coded to production sizing (Cloud SQL db-custom-2-8192 REGIONAL 100GB,
# Memorystore STANDARD_HA 5GB, 2 regional clusters, Filestore 1TiB) which costs
# ~$2000/month. Every deviation from prod is listed in
# docs/audit/TEST_ENV_RUNBOOK.md with what it does and does not prove.

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

locals {
  prefix = "vibecore-audit"
}

########################################
# Network
########################################

resource "google_compute_network" "main" {
  name                    = "${local.prefix}-vpc"
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
}

resource "google_compute_subnetwork" "app" {
  name                     = "${local.prefix}-app"
  ip_cidr_range            = "10.10.0.0/20"
  region                   = var.region
  network                  = google_compute_network.main.id
  private_ip_google_access = true

  secondary_ip_range {
    range_name    = "app-pods"
    ip_cidr_range = "10.20.0.0/16"
  }

  secondary_ip_range {
    range_name    = "app-services"
    ip_cidr_range = "10.30.0.0/20"
  }
}

# Private Service Access, required for the Cloud SQL private IP (same shape as
# prod, where the platform reaches Postgres over a private address).
resource "google_compute_global_address" "sql_psa" {
  name          = "${local.prefix}-sql-psa"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main.id
}

resource "google_service_networking_connection" "sql_psa" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.sql_psa.name]
}

########################################
# GKE — one zonal cluster, two pools
########################################

resource "google_container_cluster" "main" {
  name     = "${local.prefix}-cluster"
  location = var.zone

  # Managed separately below so each pool can be sized/labelled independently.
  remove_default_node_pool = true
  initial_node_count       = 1

  network    = google_compute_network.main.self_link
  subnetwork = google_compute_subnetwork.app.self_link

  # Required for the tenant-isolation proofs (NetworkPolicy must actually be
  # enforced, not merely declared in a manifest).
  network_policy {
    enabled  = true
    provider = "CALICO"
  }

  datapath_provider = "LEGACY_DATAPATH"

  ip_allocation_policy {
    cluster_secondary_range_name  = "app-pods"
    services_secondary_range_name = "app-services"
  }

  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  release_channel {
    channel = "REGULAR"
  }

  # Ephemeral environment: teardown must not require a manual console step.
  deletion_protection = false

  resource_labels = var.labels
}

resource "google_container_node_pool" "app" {
  name     = "app"
  cluster  = google_container_cluster.main.id
  location = var.zone

  node_count = var.app_node_count

  node_config {
    machine_type = var.app_machine_type
    disk_type    = "pd-balanced"
    disk_size_gb = 50
    image_type   = "COS_CONTAINERD"

    oauth_scopes = ["https://www.googleapis.com/auth/cloud-platform"]
    labels       = merge(var.labels, { "vibecore.ai/node-pool" = "app" })

    workload_metadata_config {
      mode = "GKE_METADATA"
    }
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }
}

# gVisor pool: this is what makes the workspace-isolation proofs real rather
# than simulated. GKE Sandbox requires COS_CONTAINERD and its own pool.
resource "google_container_node_pool" "sandbox" {
  provider = google-beta

  name     = "sandbox-gvisor"
  cluster  = google_container_cluster.main.id
  location = var.zone

  node_count = 1

  node_config {
    machine_type = var.sandbox_machine_type
    disk_type    = "pd-balanced"
    disk_size_gb = 50
    image_type   = "COS_CONTAINERD"

    oauth_scopes = ["https://www.googleapis.com/auth/cloud-platform"]
    # NOTE: `sandbox.gke.io/runtime=gvisor` is NOT set here — GKE owns that
    # label and rejects it with 400 when specified manually. It is applied by
    # GKE itself as a result of `sandbox_config` below. (The prod module
    # infra/terraform/modules/gke-workspaces/main.tf:78 still sets it, so a
    # from-scratch prod rebuild would fail the same way — reported separately.)
    labels = merge(var.labels, {
      "vibecore.ai/node-pool" = "sandbox"
    })

    sandbox_config {
      sandbox_type = "gvisor"
    }

    workload_metadata_config {
      mode = "GKE_METADATA"
    }
  }

  management {
    auto_repair  = true
    auto_upgrade = true
  }
}

########################################
# Cloud SQL — real managed Postgres with PITR
########################################

resource "random_password" "sql_app" {
  length  = 32
  special = false
}

resource "google_sql_database_instance" "postgres" {
  name             = "${local.prefix}-postgres"
  region           = var.region
  database_version = "POSTGRES_16"

  # Ephemeral: destroy must succeed unattended.
  deletion_protection = false

  depends_on = [google_service_networking_connection.sql_psa]

  settings {
    # ENTERPRISE explicitly: the API now defaults new instances to
    # ENTERPRISE_PLUS, which rejects shared-core tiers and would force a
    # db-perf-optimized machine (several times the cost) on a test box.
    edition           = "ENTERPRISE"
    tier              = "db-g1-small"
    availability_type = "ZONAL"
    disk_type         = "PD_SSD"
    disk_size         = 10
    disk_autoresize   = true
    user_labels       = var.labels

    # PITR is the point: it makes the restore / rollback proofs real.
    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "03:00"
      transaction_log_retention_days = 3
      backup_retention_settings {
        retained_backups = 7
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.main.id
      ssl_mode        = "ENCRYPTED_ONLY"
    }
  }
}

resource "google_sql_database" "app" {
  name     = "vibecore"
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "app" {
  name     = "vibecore"
  instance = google_sql_database_instance.postgres.name
  password = random_password.sql_app.result
}

########################################
# Object storage — same bucket set as prod, force_destroy for teardown
########################################

locals {
  buckets = toset(["snapshots", "exports", "deployments", "backups", "logs"])
}

resource "google_storage_bucket" "private" {
  for_each                    = local.buckets
  name                        = "${var.project_id}-${each.key}"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  labels                      = var.labels

  # Object versioning is required by the "restore / disappearance" proofs.
  versioning {
    enabled = true
  }

  # Ephemeral: teardown must not be blocked by residual objects.
  force_destroy = true
}

########################################
# Artifact Registry — images built from the repo land here, never in prod
########################################

resource "google_artifact_registry_repository" "containers" {
  location      = var.region
  repository_id = "${local.prefix}-containers"
  format        = "DOCKER"
  labels        = var.labels
}

########################################
# Workload Identity service account for GCS access from pods
########################################

resource "google_service_account" "app" {
  account_id   = "${local.prefix}-app"
  display_name = "Vibecore audit-test app workload"
}

resource "google_storage_bucket_iam_member" "app_object_admin" {
  for_each = google_storage_bucket.private
  bucket   = each.value.name
  role     = "roles/storage.objectAdmin"
  member   = "serviceAccount:${google_service_account.app.email}"
}

# The half that was missing. Granting the GCP service account objectAdmin on the
# buckets (above) does nothing on its own: a pod authenticates as its KUBERNETES
# service account, and without this binding + the matching
# `iam.gke.io/gcp-service-account` annotation (global.workloadIdentity in
# values-audit-test.yaml) Workload Identity has no link between the two. The pods
# then fall back to the node service account, whose scopes are deliberately
# minimal — so every GCS write (object storage, snapshots, database backups)
# fails with a 403 that looks like a bucket-permission problem while the bucket
# IAM is in fact correct.
#
# One binding per KUBERNETES service account that touches GCS. The member format
# is fixed by GKE: serviceAccount:<PROJECT>.svc.id.goog[<namespace>/<ksa>].
# The KSA names come from the chart's fullname (release `vibecore`, chart
# `vibecore-platform`) — see infra/helm/platform/templates/serviceaccounts.yaml.
resource "google_service_account_iam_member" "app_workload_identity" {
  for_each = toset([
    "vibecore-vibecore-platform-api",
    "vibecore-vibecore-platform-worker",
  ])

  service_account_id = google_service_account.app.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[vibecore/${each.value}]"
}
