locals {
  secrets = toset([
    "database-url",
    "redis-url",
    "jwt-secret",
    "encryption-key",
    "stripe-secret-key",
    "stripe-webhook-secret",
    "openai-api-key",
    "anthropic-api-key",
    "sentry-dsn",
    "artifact-promotion-config-json"
  ])
}

resource "google_secret_manager_secret" "platform" {
  for_each  = local.secrets
  secret_id = "${var.name_prefix}-${each.key}"
  labels    = var.labels

  replication {
    auto {}
  }
}
