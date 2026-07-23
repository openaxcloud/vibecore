variable "project_id" { type = string }
variable "name_prefix" { type = string }
variable "labels" { type = map(string) }

variable "api_host" {
  type        = string
  description = "Host RÉEL surveillé par l'uptime check (ex: api.e-code.ai). Jamais un placeholder : un host fictif = SLI factice (échec 100 % silencieux, prouvé le 2026-07-21)."

  validation {
    condition     = !can(regex("example\\.com|example\\.invalid|replace-me", var.api_host))
    error_message = "api_host ne doit pas être un placeholder (example.com / replace-me) — le SLI serait factice."
  }
}

variable "ops_email" {
  type        = string
  description = "Adresse RÉELLE du canal d'alerte (jamais *.invalid — canal mort prouvé le 2026-07-21)."

  validation {
    condition     = !can(regex("@example\\.|\\.invalid$", var.ops_email))
    error_message = "ops_email ne doit pas être un placeholder (*.invalid / @example.*) — les alertes partiraient dans le vide."
  }
}

variable "web_host" {
  type        = string
  description = "Host RÉEL de l'app web publique, surveillé par l'uptime check web (CTR-OPERATIONS-DR : jamais un placeholder)."

  validation {
    condition     = !can(regex("example\\.com|example\\.invalid|replace-me", var.web_host))
    error_message = "web_host ne doit pas être un placeholder (example.com / replace-me) — le SLI serait factice."
  }
}
