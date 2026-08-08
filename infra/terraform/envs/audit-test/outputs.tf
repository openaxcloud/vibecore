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
  # TLS is NOT optional: the instance runs ssl_mode=ENCRYPTED_ONLY (as prod
  # does), so a cleartext connection is refused by the server. And Cloud SQL
  # presents a certificate signed by a per-instance CA that chains to no public
  # root, so verification has to be waived — the traffic stays encrypted, only
  # chain validation is skipped.
  #
  # `sslmode=no-verify`, NOT `sslmode=require&sslaccept=accept_invalid_certs`:
  # `sslaccept` is a Prisma-engine parameter, and Prisma 7 connects through the
  # `pg` adapter, which ignores it. The from-scratch install failed on exactly
  # that (`TlsConnectionError: unable to verify the first certificate`) — the
  # migration hook and the api both died with an encrypted-but-unverifiable
  # certificate. `no-verify` is a `pg`/libpq mode: encrypt, do not verify.
  #
  # The rigorous alternative is to download the instance CA and use
  # sslmode=verify-ca with sslrootcert — rejected here because it makes the
  # secret depend on a per-instance file the throwaway env would have to ship.
  value       = "postgresql://vibecore:${random_password.sql_app.result}@${google_sql_database_instance.postgres.private_ip_address}:5432/vibecore?sslmode=no-verify"
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
