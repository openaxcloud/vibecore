locals {
  buckets = toset(["snapshots", "exports", "deployments", "backups", "logs"])
}

resource "google_storage_bucket" "private" {
  for_each                    = local.buckets
  name                        = "${var.project_id}-${var.name_prefix}-${each.key}"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  labels                      = var.labels

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      age = each.key == "backups" ? 365 : 90
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = each.key == "backups" ? 2555 : 365
    }
    action {
      type = "Delete"
    }
  }
}
