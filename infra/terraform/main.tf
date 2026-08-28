provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

locals {
  name_prefix = "vibecore-${var.environment}"
  labels = merge(var.labels, {
    app         = "vibecore"
    environment = var.environment
    managed_by  = "terraform"
  })
}

module "network" {
  source      = "./modules/network"
  project_id  = var.project_id
  region      = var.region
  name_prefix = local.name_prefix
  labels      = local.labels
}

module "artifact_registry" {
  source      = "./modules/artifact-registry"
  region      = var.region
  name_prefix = local.name_prefix
  labels      = local.labels
}

module "iam" {
  source                                  = "./modules/iam"
  project_id                              = var.project_id
  name_prefix                             = local.name_prefix
  labels                                  = local.labels
  artifact_promotion_repositories         = var.artifact_promotion_repositories
  binary_authorization_policy_projects    = var.binary_authorization_policy_projects
  server_deploy_builder_repository        = var.server_deploy_builder_repository
  server_deploy_builder_pull_repositories = var.server_deploy_builder_pull_repositories
  server_deploy_cosign_kms_key_id         = var.server_deploy_cosign_kms_key_id
}

module "cloud_sql" {
  source               = "./modules/cloud-sql"
  name_prefix          = local.name_prefix
  region               = var.region
  private_network_id   = module.network.vpc_id
  private_network_link = module.network.vpc_self_link
  deletion_protection  = var.environment == "prod"
  labels               = local.labels
}

module "redis" {
  source             = "./modules/redis"
  name_prefix        = local.name_prefix
  region             = var.region
  authorized_network = module.network.vpc_id
  labels             = local.labels
}

module "storage" {
  source                         = "./modules/storage"
  project_id                     = var.project_id
  region                         = var.region
  name_prefix                    = local.name_prefix
  labels                         = local.labels
  platform_service_account_email = module.iam.platform_workload_service_account
}

module "secret_manager" {
  source      = "./modules/secret-manager"
  name_prefix = local.name_prefix
  labels      = local.labels
}

module "gke_app" {
  source                    = "./modules/gke-app"
  project_id                = var.project_id
  region                    = var.region
  name_prefix               = local.name_prefix
  network                   = module.network.vpc_self_link
  subnet                    = module.network.app_subnet_self_link
  service_account_email     = module.iam.app_gke_node_service_account
  workload_identity_project = "${var.project_id}.svc.id.goog"
  master_cidr               = "172.16.0.0/28"
  labels                    = local.labels
}

module "gke_workspaces" {
  source                    = "./modules/gke-workspaces"
  project_id                = var.project_id
  region                    = var.region
  name_prefix               = local.name_prefix
  network                   = module.network.vpc_self_link
  subnet                    = module.network.workspaces_subnet_self_link
  service_account_email     = module.iam.workspaces_gke_node_service_account
  workload_identity_project = "${var.project_id}.svc.id.goog"
  master_cidr               = "172.16.1.0/28"
  labels                    = local.labels
}

module "dns" {
  source         = "./modules/dns"
  name_prefix    = local.name_prefix
  domain         = var.domain
  preview_domain = var.preview_domain
  labels         = local.labels
}

module "monitoring" {
  source      = "./modules/monitoring"
  project_id  = var.project_id
  name_prefix = local.name_prefix
  labels      = local.labels
}
