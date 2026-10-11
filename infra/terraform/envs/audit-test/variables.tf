variable "project_id" {
  type    = string
  default = "vibecore-audit-test-20260807"
}

variable "region" {
  type    = string
  default = "europe-west9"
}

variable "zone" {
  type    = string
  default = "europe-west9-a"
}

# Sized for the audit ("option B"): enough headroom that a concurrency or load
# proof fails on a real defect, not on capacity.
variable "app_node_count" {
  type    = number
  default = 2
}

variable "app_machine_type" {
  type    = string
  default = "e2-standard-4"
}

variable "sandbox_machine_type" {
  type    = string
  default = "e2-standard-4"
}

variable "labels" {
  type = map(string)
  default = {
    env        = "audit-test"
    ephemeral  = "true"
    owner      = "platform-audit"
    managed_by = "terraform"
  }
}
