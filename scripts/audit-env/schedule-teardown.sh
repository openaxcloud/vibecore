#!/usr/bin/env bash
# Arms the TTL: a Cloud Scheduler job INSIDE the test project that deletes the
# test project itself at T+7 days. Self-contained on purpose — it lives in the
# thing it destroys, so it cannot outlive it and cannot touch anything else.
#
# Cancel / extend:  gcloud scheduler jobs delete audit-env-teardown \
#                     --location=europe-west1 --project=<PROJECT>
set -euo pipefail

PROJECT_ID="${AUDIT_PROJECT_ID:-vibecore-audit-test-20260807}"
PROD_PROJECT="vibecore-495216"
LOCATION="${SCHEDULER_LOCATION:-europe-west9}" # meme region que le reste ; une autre region renvoie NOT_FOUND
FIRE_CRON="${FIRE_CRON:-0 3 14 8 *}"           # 2026-08-14 03:00 UTC = J+7
SA_NAME="audit-teardown"

[[ "$PROJECT_ID" == "$PROD_PROJECT" ]] && { echo "REFUS: cible = PROD." >&2; exit 1; }

gcloud services enable cloudscheduler.googleapis.com --project="$PROJECT_ID"

if ! gcloud iam service-accounts describe \
  "$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com" --project="$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="Audit env TTL teardown" --project="$PROJECT_ID"
fi

# Scoped to THIS project only: the SA can delete its own project, nothing else.
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/resourcemanager.projectDeleter" --condition=None --quiet >/dev/null

gcloud scheduler jobs delete audit-env-teardown \
  --location="$LOCATION" --project="$PROJECT_ID" --quiet >/dev/null 2>&1 || true

gcloud scheduler jobs create http audit-env-teardown \
  --location="$LOCATION" --project="$PROJECT_ID" \
  --schedule="$FIRE_CRON" --time-zone="UTC" \
  --uri="https://cloudresourcemanager.googleapis.com/v1/projects/$PROJECT_ID" \
  --http-method=DELETE \
  --oauth-service-account-email="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
  --description="TTL J+7 de l'environnement d'audit ephemere"

echo "==> TTL arme: suppression de $PROJECT_ID planifiee ($FIRE_CRON UTC)"
echo "==> Annuler/prolonger: gcloud scheduler jobs delete audit-env-teardown --location=$LOCATION --project=$PROJECT_ID"
