# Chaîne d'alerte API — RÉELLE depuis le 2026-07-21.
#
# Historique (CTR-OPERATIONS-DR, réserve expert n°1) : ce module portait des
# placeholders en dur (host `replace-me.example.com`, email
# `ops@example.invalid`, canal disabled) — l'uptime check échouait à 100 %
# pendant que la vraie API répondait 200, et la policy notifiait une adresse
# morte. La réparation a d'abord été faite EN LIVE (2026-07-21, evidence
# EVID-DR-MON-001) ; ce fichier persiste la même configuration dans la source
# de vérité pour qu'un `terraform apply` ne réintroduise jamais la version
# cassée. Les valeurs réelles arrivent par variables (défauts posés dans
# envs/prod/variables.tf).
#
# CONVERGENCE APPLY (une fois, opérateur) : les objets live réparés à la main
# ne sont pas dans le state. Après le premier apply réussi de cette version,
# supprimer les doublons créés à la main le 2026-07-21 :
#   gcloud monitoring uptime delete vibecore-prod-api-health-api-e-code-ai-UBigUqgiGrg
#   gcloud alpha monitoring channels delete projects/vibecore-495216/notificationChannels/16784247357547337289 --force
# (ou, à la place de l'apply-création : `terraform import` de ces deux objets.)

resource "google_monitoring_notification_channel" "ops_email" {
  display_name = "${var.name_prefix} ops email"
  type         = "email"
  labels = {
    email_address = var.ops_email
  }
  enabled = true
}

moved {
  from = google_monitoring_notification_channel.ops_email_placeholder
  to   = google_monitoring_notification_channel.ops_email
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
      host       = var.api_host
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
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.labels.check_id=\"${google_monitoring_uptime_check_config.api_health.uptime_check_id}\""
      duration        = "120s"
      comparison      = "COMPARISON_LT"
      threshold_value = 1

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_FRACTION_TRUE"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.ops_email.name]
}

# CTR-OPERATIONS-DR (réserve V3 n°1) — SLO WEB réel. Même mécanique que l'API,
# host RÉEL (var.web_host, validé anti-placeholder). Ferme l'obligation « SLO
# web » qui était UNTESTED faute de check.
resource "google_monitoring_uptime_check_config" "web_health" {
  display_name = "${var.name_prefix} web health"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path         = "/"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.web_host
    }
  }
}

resource "google_monitoring_alert_policy" "web_uptime_failed" {
  display_name = "${var.name_prefix} web uptime failed"
  combiner     = "OR"
  enabled      = true

  conditions {
    display_name = "Web uptime check failed"
    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.labels.check_id=\"${google_monitoring_uptime_check_config.web_health.uptime_check_id}\""
      duration        = "120s"
      comparison      = "COMPARISON_LT"
      threshold_value = 1

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_FRACTION_TRUE"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.ops_email.name]
}
