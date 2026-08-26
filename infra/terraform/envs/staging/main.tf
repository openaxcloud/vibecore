module "platform" {
  source = "../.."

  project_id                              = var.project_id
  region                                  = var.region
  environment                             = "staging"
  domain                                  = var.domain
  preview_domain                          = var.preview_domain
  labels                                  = var.labels
  artifact_promotion_repositories         = var.artifact_promotion_repositories
  binary_authorization_policy_projects    = var.binary_authorization_policy_projects
  server_deploy_builder_repository        = var.server_deploy_builder_repository
  server_deploy_builder_pull_repositories = var.server_deploy_builder_pull_repositories
  server_deploy_cosign_kms_key_id         = var.server_deploy_cosign_kms_key_id
}
