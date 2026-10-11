resource "google_container_cluster" "workspaces" {
  provider                 = google-beta
  name                     = "${var.name_prefix}-workspaces"
  location                 = var.region
  network                  = var.network
  subnetwork               = var.subnet
  remove_default_node_pool = true
  initial_node_count       = 1
  deletion_protection      = true
  networking_mode          = "VPC_NATIVE"
  datapath_provider        = "ADVANCED_DATAPATH"
  enable_shielded_nodes    = true
  resource_labels          = var.labels

  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = var.master_cidr
  }

  ip_allocation_policy {
    cluster_secondary_range_name  = "workspace-pods"
    services_secondary_range_name = "workspace-services"
  }

  workload_identity_config {
    workload_pool = var.workload_identity_project
  }

  release_channel {
    channel = "REGULAR"
  }

  addons_config {
    # Dataplane V2 (datapath_provider = ADVANCED_DATAPATH, set above) has built-in
    # NetworkPolicy enforcement that conflicts with the Calico network-policy addon
    # and the standalone `network_policy` block — disable/omit them; DPv2 enforces
    # our NetworkPolicy objects natively.
    network_policy_config {
      disabled = true
    }
  }

  master_authorized_networks_config {}
}

resource "google_container_node_pool" "sandbox" {
  provider   = google-beta
  name       = "sandbox-gvisor"
  location   = var.region
  cluster    = google_container_cluster.workspaces.name
  node_count = 3

  autoscaling {
    min_node_count = 3
    max_node_count = 50
  }

  node_config {
    machine_type    = "e2-standard-8"
    service_account = var.service_account_email
    # Least-privilege OAuth scopes for nodes running UNTRUSTED tenant code. Dropping
    # the broad cloud-platform scope removes the second (scope) ceiling: a gVisor
    # escape that reaches the node metadata server now obtains a token limited to
    # these scopes, not full cloud. These are the GKE-default minimal scopes —
    # devstorage.read_only keeps Artifact Registry image pulls working (paired with
    # the node SA's roles/artifactregistry.reader granted in modules/iam), plus
    # logging/monitoring/trace. NOTE: changing oauth_scopes RECREATES the node pool
    # (ForceNew) — apply in a maintenance window or via blue-green pool migration.
    oauth_scopes = [
      "https://www.googleapis.com/auth/devstorage.read_only",
      "https://www.googleapis.com/auth/logging.write",
      "https://www.googleapis.com/auth/monitoring",
      "https://www.googleapis.com/auth/service.management.readonly",
      "https://www.googleapis.com/auth/servicecontrol",
      "https://www.googleapis.com/auth/trace.append",
    ]
    # `sandbox.gke.io/runtime=gvisor` is NOT declared here: GKE now REFUSES a
    # node pool whose node_config.labels sets it, with
    #   Error 400: Node labels with key "sandbox.gke.io/runtime" are managed by
    #   GKE and must not be manually specified.
    # GKE poses it itself from sandbox_config below, so declaring it by hand made
    # a from-scratch rebuild of this cluster fail (reproduced on the audit test
    # project, 2026-08-07). The scheduling contract is unchanged — verified live
    # on a pool created with sandbox_config alone: the node carries
    # `sandbox.gke.io/runtime=gvisor` plus the matching NoSchedule taint.
    labels = merge(var.labels, { "vibecore.ai/node-pool" = "sandbox" })
    tags   = ["vibecore-workspace-sandbox"]

    # Sole supported way to obtain a gVisor pool. Also poses the
    # `sandbox.gke.io/runtime=gvisor` node label and the matching
    # `sandbox.gke.io/runtime=gvisor:NoSchedule` taint.
    sandbox_config {
      sandbox_type = "gvisor"
    }

    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }
  }
}
