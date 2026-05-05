#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-us-central1}"
STATE_BUCKET="${STATE_BUCKET:-}"
TF_SERVICE_ACCOUNT="${TF_SERVICE_ACCOUNT:-vibecore-terraform}"

if [[ -z "${PROJECT_ID}" || -z "${STATE_BUCKET}" ]]; then
  echo "Usage: PROJECT_ID=<gcp-project> STATE_BUCKET=<unique-tf-state-bucket> REGION=us-central1 infra/gcp/bootstrap.sh" >&2
  exit 1
fi

gcloud config set project "${PROJECT_ID}"

gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  cloudkms.googleapis.com \
  cloudresourcemanager.googleapis.com \
  compute.googleapis.com \
  container.googleapis.com \
  dns.googleapis.com \
  iam.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com \
  redis.googleapis.com \
  secretmanager.googleapis.com \
  servicenetworking.googleapis.com \
  sqladmin.googleapis.com \
  storage.googleapis.com

if ! gcloud iam service-accounts describe "${TF_SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${TF_SERVICE_ACCOUNT}" \
    --display-name "VibeCore Terraform deployer"
fi

for role in \
  roles/artifactregistry.admin \
  roles/compute.networkAdmin \
  roles/container.admin \
  roles/dns.admin \
  roles/iam.serviceAccountAdmin \
  roles/iam.serviceAccountUser \
  roles/iam.workloadIdentityPoolAdmin \
  roles/logging.configWriter \
  roles/monitoring.admin \
  roles/redis.admin \
  roles/resourcemanager.projectIamAdmin \
  roles/secretmanager.admin \
  roles/servicenetworking.networksAdmin \
  roles/storage.admin \
  roles/cloudsql.admin; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member "serviceAccount:${TF_SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role "${role}" \
    --condition=None >/dev/null
done

if ! gsutil ls -b "gs://${STATE_BUCKET}" >/dev/null 2>&1; then
  gsutil mb -p "${PROJECT_ID}" -l "${REGION}" -b on "gs://${STATE_BUCKET}"
  gsutil versioning set on "gs://${STATE_BUCKET}"
  gsutil retention set 30d "gs://${STATE_BUCKET}"
fi

echo "Bootstrap complete."
echo "Terraform backend bucket: gs://${STATE_BUCKET}"
echo "Terraform service account: ${TF_SERVICE_ACCOUNT}@${PROJECT_ID}.iam.gserviceaccount.com"
