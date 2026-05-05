resource "google_artifact_registry_repository" "containers" {
  location      = var.region
  repository_id = "${var.name_prefix}-containers"
  description   = "VibeCore production container images"
  format        = "DOCKER"
  labels        = var.labels
}
