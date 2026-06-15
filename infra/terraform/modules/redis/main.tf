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

  # Match the live instance so `terraform plan` is a no-op instead of trying to
  # drop the setting (state shows maxmemory-policy=noeviction; the absence of
  # this block was the observed drift). noeviction is the safe default for a
  # cache+queue Redis — under memory pressure it errors writes rather than
  # silently evicting BullMQ job state or session/rate-limit keys.
  redis_configs = {
    "maxmemory-policy" = "noeviction"
  }
}
