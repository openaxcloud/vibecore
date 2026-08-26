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
    # Dataplane V2 (datapath_provider = ADVANCED_DATAPATH, set above) has built-in
    # NetworkPolicy enforcement. The Calico network-policy addon + the standalone
    # `network_policy` block conflict with Dataplane V2 (GKE rejects/ignores the
    # combination) — so the Calico addon must be disabled and the network_policy
    # block omitted. Our NetworkPolicy objects are still enforced, natively by DPv2.
    network_policy_config {
      disabled = true
    }
  }

  master_authorized_networks_config {}
}

resource "google_container_node_pool" "system" {
  # The prefix lets Terraform create the replacement pool BEFORE draining and
  # removing the old one whenever an immutable node setting changes. A fixed
  # name cannot coexist with its replacement, which made a disk-size correction
  # inherently disruptive. Nothing schedules against the generated GKE pool
  # name; workloads use the stable `vibecore.ai/node-pool=app-system` label.
  #
  # Renamed system -> system-std when the boot disks were moved off pd-ssd. The
  # regional SSD_TOTAL_GB quota counts pd-ssd AND pd-balanced; the platform
  # services here are stateless (data lives on the RWX Filestore PVC), so their
  # node boot disks do not need SSD. Using small pd-standard disks keeps the SSD
  # quota free for the gVisor workspace pool's pd-balanced disks (otherwise the
  # workspace autoscaler is blocked at the quota and workspaces go Pending).
  name_prefix = "system-std-"
  location    = var.region
  cluster     = google_container_cluster.app.name
  node_count  = 1 # per zone (regional) => 3 nodes total

  lifecycle {
    create_before_destroy = true
  }

  upgrade_settings {
    strategy        = "SURGE"
    max_surge       = 1
    max_unavailable = 0
  }

  autoscaling {
    min_node_count = 1
    max_node_count = 3
  }

  node_config {
    machine_type = "e2-standard-4"
    disk_type    = "pd-standard"
    # 50 GiB oscillated into DiskPressure during a seven-image rollout and
    # evicted 28 workspace-manager pods. 200 GiB matches the measured platform
    # footprint with enough headroom for the old and new image generations
    # while kubelet garbage collection catches up.
    disk_size_gb    = 200
    service_account = var.service_account_email
    oauth_scopes    = ["https://www.googleapis.com/auth/cloud-platform"]
    labels          = merge(var.labels, { "vibecore.ai/node-pool" = "app-system" })

    shielded_instance_config {
      enable_secure_boot          = true
      enable_integrity_monitoring = true
    }
  }
}
