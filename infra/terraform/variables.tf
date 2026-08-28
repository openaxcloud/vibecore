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

variable "artifact_promotion_repositories" {
  description = "Repository-scoped API IAM grants for the OCI lifecycle. Every project-image source and target repo needs repoAdmin for promotion rollback and exact hard-delete erasure; reader is only valid for read-only inputs."
  type = list(object({
    project    = string
    location   = string
    repository = string
    role       = string
  }))
  default = []

  validation {
    condition = alltrue([
      for grant in var.artifact_promotion_repositories : contains([
        "roles/artifactregistry.reader",
        "roles/artifactregistry.repoAdmin"
      ], grant.role)
    ])
    error_message = "Artifact promotion repository roles are limited to reader or repoAdmin."
  }
}

check "server_deploy_registry_erasure_grant" {
  assert {
    condition = var.server_deploy_builder_repository == null ? true : contains([
      for grant in var.artifact_promotion_repositories :
      "${grant.project}/${grant.location}/${grant.repository}/${grant.role}"
    ], "${var.server_deploy_builder_repository.project}/${var.server_deploy_builder_repository.location}/${var.server_deploy_builder_repository.repository}/roles/artifactregistry.repoAdmin")
    error_message = "The API platform identity needs roles/artifactregistry.repoAdmin on the server-deploy source repository so project hard-delete can inventory and erase it exactly."
  }
}

variable "binary_authorization_policy_projects" {
  description = "Projects containing the tenant Binary Authorization policies evaluated by the API."
  type        = set(string)
  default     = []
}

variable "server_deploy_builder_repository" {
  description = "Source Artifact Registry repository written by the dedicated server-image Cloud Build identity. Null keeps the producer disabled."
  type = object({
    project    = string
    location   = string
    repository = string
  })
  default = null
}

variable "server_deploy_builder_pull_repositories" {
  description = "Artifact Registry repositories containing private base/runtime images pulled by the dedicated builder."
  type = list(object({
    project    = string
    location   = string
    repository = string
  }))
  default = []
}

variable "server_deploy_cosign_kms_key_id" {
  description = "Full CryptoKey resource id granted to the dedicated builder. Empty keeps the producer disabled."
  type        = string
  default     = ""

  validation {
    condition = var.server_deploy_cosign_kms_key_id == "" || can(regex(
      "^projects/[a-z][a-z0-9-]{4,61}[a-z0-9]/locations/[a-z0-9-]+/keyRings/[A-Za-z0-9_-]+/cryptoKeys/[A-Za-z0-9_-]+$",
      var.server_deploy_cosign_kms_key_id
    ))
    error_message = "server_deploy_cosign_kms_key_id must be an exact CryptoKey resource id."
  }
}

check "server_deploy_builder_configuration_is_atomic" {
  assert {
    condition = (
      (var.server_deploy_builder_repository == null && var.server_deploy_cosign_kms_key_id == "") ||
      (var.server_deploy_builder_repository != null && var.server_deploy_cosign_kms_key_id != "")
    )
    error_message = "Configure both the dedicated builder repository and Cosign CryptoKey, or neither."
  }

  assert {
    condition = var.server_deploy_builder_repository == null || (
      var.server_deploy_builder_repository.project == var.project_id &&
      startswith(var.server_deploy_cosign_kms_key_id, "projects/${var.project_id}/")
    )
    error_message = "The builder repository and KMS key must belong to project_id."
  }
}
