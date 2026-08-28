variable "project_id" { type = string }
variable "name_prefix" { type = string }
variable "labels" { type = map(string) }

variable "artifact_promotion_repositories" {
  type = list(object({
    project    = string
    location   = string
    repository = string
    role       = string
  }))
  default = []
}

variable "binary_authorization_policy_projects" {
  type    = set(string)
  default = []
}

variable "server_deploy_builder_repository" {
  type = object({
    project    = string
    location   = string
    repository = string
  })
  default = null
}

variable "server_deploy_builder_pull_repositories" {
  type = list(object({
    project    = string
    location   = string
    repository = string
  }))
  default = []
}

variable "server_deploy_cosign_kms_key_id" {
  type    = string
  default = ""
}

check "server_deploy_registry_erasure_grant" {
  assert {
    condition = var.server_deploy_builder_repository == null ? true : contains([
      for grant in var.artifact_promotion_repositories :
      "${grant.project}/${grant.location}/${grant.repository}/${grant.role}"
    ], "${var.server_deploy_builder_repository.project}/${var.server_deploy_builder_repository.location}/${var.server_deploy_builder_repository.repository}/roles/artifactregistry.repoAdmin")
    error_message = "The platform workload needs repoAdmin on the app-image source repository for exact registry erasure."
  }
}
