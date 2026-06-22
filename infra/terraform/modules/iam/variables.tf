variable "project_id" { type = string }
variable "name_prefix" { type = string }
variable "labels" { type = map(string) }

# Workspace snapshot storage (compute/storage decoupling — see
# docs/replit-parity-isolation.md). Gated OFF by default so existing applies are
# unchanged. When enabled, binds a dedicated GSA to the workspace-manager KSA via
# Workload Identity and grants it objectAdmin on the snapshots bucket so it can
# archive/restore workspace filesystems to GCS.
variable "enable_workspace_snapshot_wi" {
  type    = bool
  default = false
}

variable "snapshots_bucket_name" {
  type    = string
  default = ""
}

variable "workspace_manager_namespace" {
  type    = string
  default = "vibecore"
}

variable "workspace_manager_ksa" {
  type    = string
  default = "workspace-manager"
}
