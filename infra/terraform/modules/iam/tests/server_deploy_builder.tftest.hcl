mock_provider "google" {}

run "dedicated_builder_has_only_explicit_scoped_grants" {
  command = plan

  variables {
    project_id  = "vibecore-prod"
    name_prefix = "vibecore-prod"
    labels      = { environment = "prod" }
    server_deploy_builder_repository = {
      project    = "vibecore-prod"
      location   = "europe-west9"
      repository = "vibecore-prod-apps"
    }
    server_deploy_builder_pull_repositories = [{
      project    = "vibecore-prod"
      location   = "europe-west9"
      repository = "vibecore-prod-containers"
    }]
    server_deploy_cosign_kms_key_id = "projects/vibecore-prod/locations/europe-west9/keyRings/ecode-supply-chain/cryptoKeys/cosign-images"
    artifact_promotion_repositories = [
      {
        project    = "vibecore-prod"
        location   = "europe-west9"
        repository = "vibecore-prod-apps"
        role       = "roles/artifactregistry.repoAdmin"
      },
      {
        project    = "tenant-prod"
        location   = "europe-west9"
        repository = "tenant-apps"
        role       = "roles/artifactregistry.repoAdmin"
      }
    ]
  }

  assert {
    condition     = length(google_service_account.server_deploy_builder) == 1
    error_message = "A configured producer must create one dedicated builder identity."
  }

  assert {
    condition     = google_project_iam_member.platform_cloud_build_submitter[0].role == "roles/cloudbuild.builds.editor"
    error_message = "The API must be able to reconcile and cancel durable Cloud Builds."
  }

  assert {
    condition = google_artifact_registry_repository_iam_member.artifact_promotion[
      "vibecore-prod/europe-west9/vibecore-prod-apps/roles/artifactregistry.repoAdmin"
    ].role == "roles/artifactregistry.repoAdmin"
    error_message = "The API must inventory and erase project packages in the source repository."
  }

  assert {
    condition     = google_service_account_iam_member.platform_server_deploy_builder_act_as[0].role == "roles/iam.serviceAccountUser"
    error_message = "The API submitter must explicitly actAs the builder."
  }

  assert {
    condition     = google_artifact_registry_repository_iam_member.server_deploy_builder_writer[0].role == "roles/artifactregistry.writer"
    error_message = "The builder must be writer only on the configured source repository."
  }

  assert {
    condition     = one(values(google_artifact_registry_repository_iam_member.server_deploy_builder_reader)).role == "roles/artifactregistry.reader"
    error_message = "The builder must have read-only access to each explicitly configured private base-image repository."
  }

  assert {
    condition     = google_kms_crypto_key_iam_member.server_deploy_builder_signer[0].role == "roles/cloudkms.signerVerifier"
    error_message = "The builder must sign only through the configured CryptoKey."
  }

  assert {
    condition     = google_kms_crypto_key_iam_member.server_deploy_builder_signer[0].crypto_key_id == var.server_deploy_cosign_kms_key_id
    error_message = "A project-wide KMS grant must never replace the exact CryptoKey binding."
  }
}

run "disabled_builder_creates_no_privileged_identity" {
  command = plan

  variables {
    project_id  = "vibecore-prod"
    name_prefix = "vibecore-prod"
    labels      = { environment = "prod" }
  }

  assert {
    condition     = length(google_service_account.server_deploy_builder) == 0
    error_message = "An unconfigured environment must not create or authorize a builder."
  }

  assert {
    condition     = length(google_kms_crypto_key_iam_member.server_deploy_builder_signer) == 0
    error_message = "KMS signing must remain disabled without atomic builder configuration."
  }

  assert {
    condition     = length(google_artifact_registry_repository_iam_member.server_deploy_builder_reader) == 0
    error_message = "Base-image grants must remain disabled with the builder."
  }
}
