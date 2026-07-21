#!/usr/bin/env bash
# Repro de la preuve WIF 3-chemins (P0-A2-09). Lecture-seule sur prod pour le
# chemin 1 ; crée+détruit un projet de test pour les chemins 2 et 3.
# Prérequis : gcloud authentifié en admin org ; CLOUDSDK_PYTHON=python3.10+ (le
# gcloud run/storage crashe sous Python 3.9) ; docker ; gh (repo openaxcloud/vibecore).
set -euo pipefail
export CLOUDSDK_PYTHON="${CLOUDSDK_PYTHON:?export CLOUDSDK_PYTHON=/path/to/python3.12}"
FOLDER=780512954993; BILLING=019D6D-45FBC1-89F220; REGION=europe-west9
# 0. idempotence
gcloud projects list --filter="projectId:ecode-wif-proof-* AND lifecycleState:ACTIVE" --format="value(projectId)"
PROJECT="ecode-wif-proof-$(date +%s | tail -c 7)"
gcloud projects create "$PROJECT" --folder="$FOLDER" --name="ECode WIF Proof"
gcloud billing projects link "$PROJECT" --billing-account="$BILLING"
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  storage.googleapis.com run.googleapis.com artifactregistry.googleapis.com logging.googleapis.com --project="$PROJECT"
BUCKET="${PROJECT}-secret-data"
gsutil mb -p "$PROJECT" -l "$REGION" -b on "gs://$BUCKET"; echo "secret" | gsutil cp - "gs://$BUCKET/secret.txt"
gcloud iam service-accounts create wif-authorized --project="$PROJECT"
gcloud iam service-accounts create wif-wrong --project="$PROJECT"
gsutil iam ch "serviceAccount:wif-authorized@${PROJECT}.iam.gserviceaccount.com:roles/storage.objectViewer" "gs://$BUCKET"
# audit Data Access
gcloud projects get-iam-policy "$PROJECT" --format=json > /tmp/p.json
python3 -c 'import json;p=json.load(open("/tmp/p.json"));p["auditConfigs"]=[{"service":"allServices","auditLogConfigs":[{"logType":"DATA_READ"},{"logType":"DATA_WRITE"}]}];json.dump(p,open("/tmp/p2.json","w"))'
gcloud projects set-iam-policy "$PROJECT" /tmp/p2.json
# --- Chemin 3 : Cloud Run metadata (build docker -> AR -> deploy) ; voir main.py/Dockerfile
# --- Chemin 2 : pool+provider OIDC GitHub + grant workloadIdentityUser+tokenCreator ; run .github/workflows/wif-proof.yml
# --- Chemin 1 : lecture-seule sur vibecore-prod-app (workloadIdentityConfig, KSA->GSA, keys list)
# ... (voir README pour les commandes détaillées de chaque preuve) ...
# TEARDOWN
gcloud run services delete wif-proof --project="$PROJECT" --region="$REGION" -q || true
gcloud artifacts repositories delete wif-proof --project="$PROJECT" --location="$REGION" -q || true
gcloud iam workload-identity-pools delete github-pool --project="$PROJECT" --location=global -q || true
gcloud projects delete "$PROJECT" -q
