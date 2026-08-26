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
