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
