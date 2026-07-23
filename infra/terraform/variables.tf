variable "project_id" {
  type        = string
  description = "Google Cloud project ID."
}

variable "region" {
  type        = string
  description = "Primary region."
}

variable "environment" {
  type        = string
  description = "Deployment environment name."
}

variable "domain" {
  type        = string
  description = "Primary app domain, e.g. app.example.com."
}

variable "preview_domain" {
  type        = string
  description = "Wildcard preview root, e.g. preview.example.com."
}

variable "labels" {
  type        = map(string)
  default     = {}
  description = "Standard resource labels."
}

variable "api_domain" {
  type        = string
  description = "Host RÉEL de l'API publique, surveillé par l'uptime check (CTR-OPERATIONS-DR : jamais un placeholder)."
  default     = "api.e-code.ai"
}

variable "ops_email" {
  type        = string
  description = "Adresse réelle du canal d'alerte ops (CTR-OPERATIONS-DR : jamais *.invalid)."
  default     = "avi@snatchbot.me"
}

variable "web_domain" {
  type        = string
  description = "Host réel de l'app web publique (CTR-OPERATIONS-DR : SLO web)."
  default     = "e-code.ai"
}
