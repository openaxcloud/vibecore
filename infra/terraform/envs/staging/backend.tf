terraform {
  backend "gcs" {
    bucket = "REPLACE_WITH_STAGING_TF_STATE_BUCKET"
    prefix = "vibecore/staging"
  }
}
