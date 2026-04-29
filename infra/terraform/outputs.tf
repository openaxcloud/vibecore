output "app_cluster_name" {
  value = module.gke_app.cluster_name
}

output "workspaces_cluster_name" {
  value = module.gke_workspaces.cluster_name
}

output "artifact_registry_repository" {
  value = module.artifact_registry.repository_id
}

output "cloud_sql_connection_name" {
  value = module.cloud_sql.connection_name
}

output "redis_host" {
  value     = module.redis.host
  sensitive = true
}

output "storage_buckets" {
  value = module.storage.bucket_names
}

output "dns_zone" {
  value = module.dns.zone_name
}
