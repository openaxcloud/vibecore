module "platform" {
  source = "../.."

  project_id     = var.project_id
  region         = var.region
  environment    = "staging"
  domain         = var.domain
  preview_domain = var.preview_domain
  labels         = var.labels
}
