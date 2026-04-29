resource "google_container_cluster" "app" {
  provider                 = google-beta
  name                     = "${var.name_prefix}-app"
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
    cluster_secondary_range_name  = "app-pods"
    services_secondary_range_name = "app-services"
  }

  workload_identity_config {
    workload_pool = var.workload_identity_project
  }

  release_channel {
    channel = "REGULAR"
  }

  addons_config {
    http_load_balancing {
      disabled = false
    }
    network_policy_config {
      disabled = false
    }
  }

  network_policy {
    enabled  = true
    provider = "CALICO"
  }

  master_authorized_networks_config {}
}

resource "google_container_node_pool" "system" {
  name       = "system"
  location   = var.region
  cluster    = google_container_cluster.app.name
  node_count = 3

  autoscaling {
    min_node_count = 3
    max_node_count = 10
  }

  node_config {
    machine_type    = "e2-standard-4"
    service_account = var.service_account_email
    oauth_scopes    = ["https://www.googleapis.com/auth/cloud-platform"]
    labels          = merge(var.labels, { "vibecore.ai/node-pool" = "app-system" })

    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }
  }
}
