resource "google_monitoring_notification_channel" "ops_email_placeholder" {
  display_name = "${var.name_prefix} ops email"
  type         = "email"
  labels = {
    email_address = "ops@example.invalid"
  }
  enabled = false
}

resource "google_monitoring_uptime_check_config" "api_health" {
  display_name = "${var.name_prefix} API health"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path         = "/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = "replace-me.example.com"
    }
  }
}

resource "google_monitoring_alert_policy" "api_uptime_failed" {
  display_name = "${var.name_prefix} API uptime failed"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "API uptime check failed"
    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\""
      duration        = "120s"
      comparison      = "COMPARISON_LT"
      threshold_value = 1

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_FRACTION_TRUE"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.ops_email_placeholder.name]
}
