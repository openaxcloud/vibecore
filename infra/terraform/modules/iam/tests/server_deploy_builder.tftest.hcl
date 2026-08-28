mock_provider "google" {}

run "dedicated_builder_has_only_explicit_scoped_grants" {
  # The provider is mocked; apply only materializes computed principals so the
  # exact member assertions below remain evaluable and hermetic.
  command = apply

  override_data {
    target = data.google_project.current
    values = { number = "123456789" }
  }

  override_resource {
    target = google_service_account.server_deploy_builder[0]
    values = {
      email = "vibecore-prod-app-builder@vibecore-prod.iam.gserviceaccount.com"
      name  = "projects/vibecore-prod/serviceAccounts/vibecore-prod-app-builder@vibecore-prod.iam.gserviceaccount.com"
    }
  }

  override_resource {
    target = google_service_account.app_gke_nodes
    values = {
      email = "vibecore-prod-app-nodes@vibecore-prod.iam.gserviceaccount.com"
      name  = "projects/vibecore-prod/serviceAccounts/vibecore-prod-app-nodes@vibecore-prod.iam.gserviceaccount.com"
    }
  }

  override_resource {
    target = google_service_account.workspaces_gke_nodes
    values = {
      email = "vibecore-prod-workspace-nodes@vibecore-prod.iam.gserviceaccount.com"
      name  = "projects/vibecore-prod/serviceAccounts/vibecore-prod-workspace-nodes@vibecore-prod.iam.gserviceaccount.com"
    }
  }

  override_resource {
    target = google_service_account.platform_workload
    values = {
      email = "vibecore-prod-platform@vibecore-prod.iam.gserviceaccount.com"
      name  = "projects/vibecore-prod/serviceAccounts/vibecore-prod-platform@vibecore-prod.iam.gserviceaccount.com"
    }
  }

  override_resource {
    target = google_service_account.server_deploy_signer[0]
    values = {
      email = "vibecore-prod-app-signer@vibecore-prod.iam.gserviceaccount.com"
      name  = "projects/vibecore-prod/serviceAccounts/vibecore-prod-app-signer@vibecore-prod.iam.gserviceaccount.com"
    }
  }

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
    condition     = length(google_service_account.server_deploy_signer) == 1
    error_message = "Verified publication must create a separate trusted signer identity."
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
    condition = (
      google_artifact_registry_repository_iam_member.server_deploy_builder_writer[0].project == "vibecore-prod" &&
      google_artifact_registry_repository_iam_member.server_deploy_builder_writer[0].repository == "vibecore-prod-apps"
    )
    error_message = "The untrusted builder must not receive a cross-tenant repository grant."
  }

  assert {
    condition = (
      google_artifact_registry_repository_iam_member.server_deploy_signer_writer[0].project == "vibecore-prod" &&
      google_artifact_registry_repository_iam_member.server_deploy_signer_writer[0].repository == "vibecore-prod-apps"
    )
    error_message = "The trusted signer must not receive a tenant-target repository grant."
  }

  assert {
    condition     = one(values(google_artifact_registry_repository_iam_member.server_deploy_builder_reader)).role == "roles/artifactregistry.reader"
    error_message = "The builder must have read-only access to each explicitly configured private base-image repository."
  }

  assert {
    condition     = google_kms_crypto_key_iam_member.server_deploy_trusted_signer[0].role == "roles/cloudkms.signerVerifier"
    error_message = "Only the trusted signer may sign through the configured CryptoKey."
  }

  assert {
    condition     = google_kms_crypto_key_iam_member.server_deploy_trusted_signer[0].crypto_key_id == var.server_deploy_cosign_kms_key_id
    error_message = "A project-wide KMS grant must never replace the exact CryptoKey binding."
  }


  assert {
    condition     = google_kms_crypto_key_iam_member.server_deploy_trusted_signer[0].member == "serviceAccount:${google_service_account.server_deploy_signer[0].email}"
    error_message = "The untrusted builder must never receive a KMS binding."
  }

  assert {
    condition     = google_service_account_iam_member.cloud_build_agent_builder_token_creator[0].member == "serviceAccount:service-123456789@gcp-sa-cloudbuild.iam.gserviceaccount.com"
    error_message = "Cloud Build's exact service agent must mint the isolated builder token."
  }

  assert {
    condition     = google_service_account_iam_member.cloud_build_agent_signer_token_creator[0].member == "serviceAccount:service-123456789@gcp-sa-cloudbuild.iam.gserviceaccount.com"
    error_message = "Cloud Build's exact service agent must mint the trusted signer token."
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
    condition     = length(google_kms_crypto_key_iam_member.server_deploy_trusted_signer) == 0
    error_message = "KMS signing must remain disabled without atomic builder configuration."
  }

  assert {
    condition     = length(google_artifact_registry_repository_iam_member.server_deploy_builder_reader) == 0
    error_message = "Base-image grants must remain disabled with the builder."
  }
}
