output "project_id" {
  value = var.project_id
}

output "cluster_name" {
  value = google_container_cluster.main.name
}

output "cluster_zone" {
  value = var.zone
}

output "cluster_get_credentials" {
  description = "Exact command to obtain a kubeconfig entry for the test cluster."
  value       = "gcloud container clusters get-credentials ${google_container_cluster.main.name} --zone ${var.zone} --project ${var.project_id}"
}

output "postgres_instance" {
  value = google_sql_database_instance.postgres.name
}

output "postgres_private_ip" {
  value = google_sql_database_instance.postgres.private_ip_address
}

output "postgres_connection_name" {
  value = google_sql_database_instance.postgres.connection_name
}

output "database_url" {
  description = "DATABASE_URL for the test platform. Test-only credential."
  # sslmode=require is NOT optional: the instance runs ssl_mode=ENCRYPTED_ONLY
  # (as prod does), so a plain connection is refused by the server.
  # sslaccept=accept_invalid_certs: Cloud SQL presents a certificate signed by a
  # per-instance CA, which Prisma's client cannot chain to a public root
  # ("TlsConnectionError: unable to verify the first certificate"). The traffic
  # stays encrypted; only chain verification is waived. The rigorous alternative
  # is to download the instance CA and use sslmode=verify-ca with sslrootcert.
  value       = "postgresql://vibecore:${random_password.sql_app.result}@${google_sql_database_instance.postgres.private_ip_address}:5432/vibecore?sslmode=require&sslaccept=accept_invalid_certs"
  sensitive   = true
}

output "buckets" {
  value = [for b in google_storage_bucket.private : b.name]
}

output "artifact_registry" {
  value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.containers.repository_id}"
}

output "workload_service_account" {
  value = google_service_account.app.email
}
