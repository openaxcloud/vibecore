#!/usr/bin/env bash
# Teardown CT-11/CT-13 — rejoué à la fin ET en cas d'imprévu. Idempotent.
export CLOUDSDK_PYTHON=python3.12 2>/dev/null
set +e
gcloud projects delete ecode-ct11-proof-7d17d8 --quiet 2>/dev/null
gcloud org-policies delete iam.disableServiceAccountKeyCreation --project=ecode-ct11-proof-7d17d8 --quiet 2>/dev/null
gcloud kms keys versions destroy 1 --key=ct11-key --keyring=ct11-kr --location=europe-west9 --project=ecode-ct11-proof-7d17d8 --quiet 2>/dev/null
gcloud kms keys versions destroy 1 --key=ct11-wrong --keyring=ct11-kr --location=europe-west9 --project=ecode-ct11-proof-7d17d8 --quiet 2>/dev/null
gcloud logging sinks delete ct11-audit-sink --project=ecode-ct11-proof-7d17d8 --quiet 2>/dev/null
gcloud logging buckets delete ct11-bucket --location=europe-west9 --project=ecode-ct11-proof-7d17d8 --quiet 2>/dev/null
gcloud logging sinks delete ct11-route-sink --project=ecode-ct11-proof-7d17d8 --quiet 2>/dev/null
gcloud projects delete ecode-ct13-tenant-b9f0 --quiet 2>/dev/null
gcloud projects delete ecode-ct13-tenant-9e2f --quiet 2>/dev/null
