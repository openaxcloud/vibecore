variable "project_id" { type = string }
variable "region" { type = string }
variable "name_prefix" { type = string }
variable "network" { type = string }
variable "subnet" { type = string }
variable "service_account_email" { type = string }
variable "workload_identity_project" { type = string }
variable "master_cidr" { type = string }
variable "labels" { type = map(string) }

variable "snapshot_schedule" {
  description = "CTR-OPERATIONS-DR : politique de snapshots planifiés des PD workspaces."
  type = object({
    enabled        = bool
    start_time_utc = string # HH:MM UTC, aligné sur 1h
    retention_days = number
  })
  default = {
    enabled        = true
    start_time_utc = "02:00"
    retention_days = 7
  }

  validation {
    condition     = can(regex("^([01][0-9]|2[0-3]):00$", var.snapshot_schedule.start_time_utc))
    error_message = "start_time_utc doit être HH:00 en UTC (les daily schedules GCE s'alignent à l'heure)."
  }

  validation {
    condition     = var.snapshot_schedule.retention_days >= 1 && var.snapshot_schedule.retention_days <= 30
    error_message = "retention_days doit être entre 1 et 30 (rétention raisonnable, coût borné)."
  }
}
