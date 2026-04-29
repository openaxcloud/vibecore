resource "google_sql_database_instance" "postgres" {
  name                = "${var.name_prefix}-postgres"
  region              = var.region
  database_version    = "POSTGRES_16"
  deletion_protection = var.deletion_protection

  settings {
    tier              = "db-custom-2-8192"
    availability_type = "REGIONAL"
    disk_type         = "PD_SSD"
    disk_size         = 100
    disk_autoresize   = true
    user_labels       = var.labels

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
      start_time                     = "03:00"
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 30
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      ipv4_enabled    = false
      private_network = var.private_network_link
      ssl_mode        = "ENCRYPTED_ONLY"
    }

    database_flags {
      name  = "log_min_duration_statement"
      value = "1000"
    }
  }
}

resource "google_sql_database" "app" {
  name     = "vibecore"
  instance = google_sql_database_instance.postgres.name
}
