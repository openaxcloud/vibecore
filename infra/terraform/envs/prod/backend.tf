terraform {
  backend "gcs" {
    bucket = "REPLACE_WITH_PROD_TF_STATE_BUCKET"
    prefix = "vibecore/prod"
  }
}
