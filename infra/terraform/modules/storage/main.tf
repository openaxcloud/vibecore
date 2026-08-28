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

  dynamic "soft_delete_policy" {
    for_each = each.key == "backups" ? [1] : []
    content {
      # Permanent database deletion verifies every generation absent. GCS soft
      # delete would keep provider-readable generations after a successful
      # DELETE, so the dedicated CNPG bucket explicitly disables it.
      retention_duration_seconds = 0
    }
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

resource "google_storage_bucket_iam_member" "platform_backup_objects" {
  bucket = google_storage_bucket.private["backups"].name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${var.platform_service_account_email}"
}

resource "google_storage_bucket_iam_member" "platform_backup_metadata" {
  bucket = google_storage_bucket.private["backups"].name
  role   = "roles/storage.legacyBucketReader"
  member = "serviceAccount:${var.platform_service_account_email}"
}
