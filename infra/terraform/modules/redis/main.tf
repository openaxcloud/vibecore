resource "google_redis_instance" "main" {
  name               = "${var.name_prefix}-redis"
  tier               = "STANDARD_HA"
  memory_size_gb     = 5
  region             = var.region
  authorized_network = var.authorized_network
  connect_mode       = "PRIVATE_SERVICE_ACCESS"
  redis_version      = "REDIS_7_2"
  display_name       = "VibeCore Redis"
  labels             = var.labels
}
