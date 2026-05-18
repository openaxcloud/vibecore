#!/bin/bash
set -e

PROJECT_ID="vibecore-495216"
REGION="europe-west9"
REPO_OWNER="openaxcloud"
REPO_NAME="vibecore"
SA_NAME="github-actions-docker"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
POOL_NAME="github-actions-pool"
PROVIDER_NAME="github-provider"

echo "=== 1. Création du Service Account ==="
gcloud iam service-accounts create "$SA_NAME" \
  --project="$PROJECT_ID" \
  --display-name="GitHub Actions Docker Builder" \
  --description="Used by GitHub Actions to build and push Docker images" \
  2>/dev/null || echo "  (SA existe déjà)"

echo ""
echo "=== 2. Attribution des rôles au SA ==="
# Artifact Registry Writer
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/artifactregistry.writer" \
  --condition=None --quiet

# Storage Admin (for layer cache)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/storage.admin" \
  --condition=None --quiet

echo "  Rôles attribués."

echo ""
echo "=== 3. Création du Workload Identity Pool ==="
gcloud iam workload-identity-pools create "$POOL_NAME" \
  --project="$PROJECT_ID" \
  --location="global" \
  --display-name="GitHub Actions Pool" \
  --description="WIF pool for GitHub Actions CI/CD" \
  2>/dev/null || echo "  (Pool existe déjà)"

echo ""
echo "=== 4. Création du Workload Identity Provider (GitHub OIDC) ==="
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_NAME" \
  --project="$PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="$POOL_NAME" \
  --display-name="GitHub OIDC Provider" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="assertion.repository_owner == '${REPO_OWNER}'" \
  2>/dev/null || echo "  (Provider existe déjà)"

echo ""
echo "=== 5. Autoriser GitHub à impersonner le SA ==="
POOL_ID=$(gcloud iam workload-identity-pools describe "$POOL_NAME" \
  --project="$PROJECT_ID" \
  --location="global" \
  --format="value(name)")

gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${POOL_ID}/attribute.repository/${REPO_OWNER}/${REPO_NAME}" \
  --quiet

echo ""
echo "=== 6. Récupération des valeurs pour GitHub Secrets ==="
PROVIDER_FULL=$(gcloud iam workload-identity-pools providers describe "$PROVIDER_NAME" \
  --project="$PROJECT_ID" \
  --location="global" \
  --workload-identity-pool="$POOL_NAME" \
  --format="value(name)")

echo ""
echo "============================================"
echo "  COPIE CES VALEURS DANS GITHUB SECRETS :"
echo "============================================"
echo ""
echo "GCP_WORKLOAD_IDENTITY_PROVIDER:"
echo "  $PROVIDER_FULL"
echo ""
echo "GCP_ARTIFACT_WRITER_SERVICE_ACCOUNT:"
echo "  $SA_EMAIL"
echo ""
echo "============================================"
echo "  ET CES VALEURS DANS GITHUB VARIABLES :"
echo "============================================"
echo ""
echo "GCP_PROJECT_ID:"
echo "  $PROJECT_ID"
echo ""
echo "GAR_LOCATION:"
echo "  $REGION"
echo ""
echo "GAR_REPOSITORY:"
echo "  vibecore-prod-containers"
echo ""
echo "=== Setup GCP terminé ! ==="
