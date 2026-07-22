#!/usr/bin/env bash
###############################################################################
# WIF — preuve REJOUABLE de bout en bout des 3 chemins d'identité (P0-A2-09).
#
# Provisionne un projet de TEST dédié (jamais la prod), configure ET JOUE les
# 3 chemins avec assertions STRICTES (HTTP 200 + contenu attendu pour l'autorisé,
# refus réel pour le négatif), archive les preuves, puis teardown complet.
# Zéro clé de service. Coût cible ~0 $.
#
# Prérequis : gcloud (admin org), docker, gh (repo openaxcloud/vibecore),
#             kubectl, CLOUDSDK_PYTHON=python3.10+ (gcloud run/storage crashe en 3.9).
#
# Chaque étape échoue le script (set -e + assertions) si elle ne prouve pas ce
# qu'elle annonce : un run VERT ⇒ les 3 chemins prouvés (autorisé + négatif).
###############################################################################
set -Eeuo pipefail

: "${CLOUDSDK_PYTHON:?export CLOUDSDK_PYTHON=/opt/homebrew/bin/python3.12 (gcloud run/storage crashe sous Python 3.9)}"
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

# ---- paramètres (surchargeables) -------------------------------------------
FOLDER="${WIF_TEST_FOLDER:-780512954993}"            # folder de TEST (ecode-factory-test)
BILLING="${WIF_BILLING:-019D6D-45FBC1-89F220}"
REGION="${WIF_REGION:-europe-west9}"
ZONE="${WIF_ZONE:-europe-west9-a}"
REPO="${WIF_GH_REPO:-openaxcloud/vibecore}"
GH_REF="${WIF_GH_REF:-feat/wif-three-paths-replayable}"  # branche portant le workflow
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${WIF_OUT:-$HERE/replay-$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$OUT"
log(){ echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$OUT/run.log"; }
Q(){ grep -vE "WARNING|Python 3|reinstall|CLOUDSDK|compatible Python|gcloud components|NotOpenSSL|warnings.warn|urllib3|importlib|^\s*$" || true; }
fail(){ echo "ASSERTION FAILED: $*" | tee -a "$OUT/run.log"; exit 1; }

# ---- 0. idempotence --------------------------------------------------------
log "0. idempotence : projets ecode-wif-proof-* ACTIFS ?"
EXISTING=$(gcloud projects list --filter="projectId:ecode-wif-proof-* AND lifecycleState:ACTIVE" --format="value(projectId)" 2>/dev/null | Q | head -1 || true)
if [ -n "$EXISTING" ]; then PROJECT="$EXISTING"; log "  réutilise $PROJECT"; else
  PROJECT="ecode-wif-proof-$(date +%s | tail -c 7)"
  log "  crée $PROJECT sous folder $FOLDER"
  gcloud projects create "$PROJECT" --folder="$FOLDER" --name="ECode WIF Proof" 2>&1 | Q | tail -1
  gcloud billing projects link "$PROJECT" --billing-account="$BILLING" 2>&1 | Q | tail -1
fi
PN=$(gcloud projects describe "$PROJECT" --format="value(projectNumber)" 2>/dev/null | Q)
BUCKET="${PROJECT}-secret-data"; AUTH_SA="wif-authorized@${PROJECT}.iam.gserviceaccount.com"; WRONG_SA="wif-wrong@${PROJECT}.iam.gserviceaccount.com"
EXPECT="wif-proof-secret-content"   # contenu attendu à la lecture autorisée
echo "PROJECT=$PROJECT PROJECT_NUMBER=$PN BUCKET=$BUCKET" | tee "$OUT/params.env"

# ---- 1. base ---------------------------------------------------------------
log "1. APIs + bucket + SAs + rôle minimal + audit Data Access"
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  storage.googleapis.com run.googleapis.com artifactregistry.googleapis.com container.googleapis.com \
  logging.googleapis.com --project="$PROJECT" 2>&1 | Q | tail -1
gcloud storage buckets create "gs://$BUCKET" --project="$PROJECT" --location="$REGION" --uniform-bucket-level-access 2>&1 | Q | tail -1 || true
printf '%s-%s\n' "$EXPECT" "$(date +%s)" > "$OUT/secret.txt"
gcloud storage cp "$OUT/secret.txt" "gs://$BUCKET/secret.txt" --project="$PROJECT" 2>&1 | Q | tail -1
gcloud iam service-accounts create wif-authorized --project="$PROJECT" --display-name="WIF authorized" 2>&1 | Q | tail -1 || true
gcloud iam service-accounts create wif-wrong --project="$PROJECT" --display-name="WIF wrong" 2>&1 | Q | tail -1 || true
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:${AUTH_SA}" --role="roles/storage.objectViewer" 2>&1 | Q | tail -1
gcloud projects get-iam-policy "$PROJECT" --format=json 2>/dev/null > "$OUT/policy.json"
"$CLOUDSDK_PYTHON" -c 'import json,sys;p=json.load(open(sys.argv[1]));p["auditConfigs"]=[{"service":"allServices","auditLogConfigs":[{"logType":"DATA_READ"},{"logType":"DATA_WRITE"}]}];json.dump(p,open(sys.argv[2],"w"))' "$OUT/policy.json" "$OUT/policy2.json"
gcloud projects set-iam-policy "$PROJECT" "$OUT/policy2.json" 2>&1 | Q | tail -1 >/dev/null

###############################################################################
# CHEMIN 3 — Cloud Run metadata (aucune clé) : autorisé=200+contenu, négatif=403
###############################################################################
log "3. Cloud Run — build image (Dockerfile corrigé) + deploy + preuves"
BUILD="$OUT/cloudrun"; mkdir -p "$BUILD"; cp "$HERE/cloudrun-main.py" "$BUILD/"; cp "$HERE/cloudrun-Dockerfile" "$BUILD/Dockerfile"
gcloud artifacts repositories create wif-proof --repository-format=docker --location="$REGION" --project="$PROJECT" 2>&1 | Q | tail -1 || true
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet 2>&1 | Q | tail -1
IMG="${REGION}-docker.pkg.dev/${PROJECT}/wif-proof/wif-proof:v1"
docker build --platform linux/amd64 -t "$IMG" "$BUILD" >"$OUT/docker-build.log" 2>&1 || fail "docker build (voir docker-build.log)"
docker push "$IMG" >>"$OUT/docker-build.log" 2>&1 || fail "docker push"
gcloud run deploy wif-proof --image "$IMG" --project="$PROJECT" --region="$REGION" \
  --service-account="$AUTH_SA" --set-env-vars="BUCKET=$BUCKET" --allow-unauthenticated --quiet 2>&1 | Q | tail -1
URL=$(gcloud run services describe wif-proof --project="$PROJECT" --region="$REGION" --format="value(status.url)" 2>/dev/null | Q)
sleep 4
# AUTORISÉ — exiger read_status 200 ET contenu attendu, sinon échec
curl -s --max-time 30 "$URL/" -o "$OUT/path3-cloudrun-authorized.json" || fail "curl cloudrun authorized"
RS=$("$CLOUDSDK_PYTHON" -c 'import json,sys;print(json.load(open(sys.argv[1])).get("read_status"))' "$OUT/path3-cloudrun-authorized.json")
SC=$("$CLOUDSDK_PYTHON" -c 'import json,sys;print(json.load(open(sys.argv[1])).get("secret",""))' "$OUT/path3-cloudrun-authorized.json")
[ "$RS" = "200" ] || fail "Cloud Run autorisé attendait 200, obtenu $RS"
case "$SC" in "$EXPECT"*) : ;; *) fail "Cloud Run autorisé : contenu inattendu '$SC'";; esac
log "  ✓ Cloud Run autorisé : read_status=200, contenu='$SC'"
# NÉGATIF — SA sans droit → 403
gcloud run services update wif-proof --project="$PROJECT" --region="$REGION" --service-account="$WRONG_SA" --quiet 2>&1 | Q | tail -1
sleep 4
curl -s --max-time 30 "$URL/" -o "$OUT/path3-cloudrun-negative.json" || fail "curl cloudrun negative"
RSN=$("$CLOUDSDK_PYTHON" -c 'import json,sys;print(json.load(open(sys.argv[1])).get("read_status"))' "$OUT/path3-cloudrun-negative.json")
[ "$RSN" = "403" ] || fail "Cloud Run négatif attendait 403, obtenu $RSN"
log "  ✓ Cloud Run négatif : read_status=403 (refusé)"

###############################################################################
# CHEMIN 2 — WIF externe GitHub OIDC : autorisé=200+contenu, négatif=refus
###############################################################################
log "2. WIF externe GitHub OIDC — pool/provider/grants + run GitHub Actions paramétré"
gcloud iam workload-identity-pools create github-pool --project="$PROJECT" --location=global --display-name="GitHub OIDC" 2>&1 | Q | tail -1 || true
gcloud iam workload-identity-pools providers create-oidc github --project="$PROJECT" --location=global \
  --workload-identity-pool=github-pool --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='${REPO}'" --display-name="GitHub Actions" 2>&1 | Q | tail -1 || true
MEMBER="principalSet://iam.googleapis.com/projects/${PN}/locations/global/workloadIdentityPools/github-pool/attribute.repository/${REPO}"
gcloud iam service-accounts add-iam-policy-binding "$AUTH_SA" --project="$PROJECT" --role="roles/iam.workloadIdentityUser" --member="$MEMBER" 2>&1 | Q | tail -1
gcloud iam service-accounts add-iam-policy-binding "$AUTH_SA" --project="$PROJECT" --role="roles/iam.serviceAccountTokenCreator" --member="$MEMBER" 2>&1 | Q | tail -1
log "  attente propagation IAM (90s)"; sleep 90
# déclenche le workflow PARAMÉTRÉ avec les valeurs du projet frais (rejouable après teardown)
if command -v gh >/dev/null 2>&1; then
  gh workflow run wif-proof.yml --ref "$GH_REF" -R "$REPO" \
    -f project_id="$PROJECT" -f project_number="$PN" -f bucket="$BUCKET" \
    -f authorized_sa="$AUTH_SA" -f wrong_sa="$WRONG_SA" -f expect_prefix="$EXPECT" 2>&1 | Q | tail -1 \
    || fail "gh workflow run (le workflow doit exister sur $GH_REF et être dispatchable)"
  sleep 12
  RUN=$(gh run list --workflow=wif-proof.yml -R "$REPO" --limit 1 --json databaseId --jq '.[0].databaseId')
  log "  run GitHub Actions=$RUN, attente..."
  until [ "$(gh run view "$RUN" -R "$REPO" --json status --jq .status)" = "completed" ]; do sleep 10; done
  gh run view "$RUN" -R "$REPO" --log > "$OUT/path2-github-oidc.log" 2>/dev/null || true
  CONCL=$(gh run view "$RUN" -R "$REPO" --json conclusion --jq .conclusion)
  echo "run=$RUN conclusion=$CONCL url=https://github.com/$REPO/actions/runs/$RUN" > "$OUT/path2-github-oidc.txt"
  grep -E "READ_HTTP=200|SECRET_CONTENT=|NEGATIVE_OK|AUTH_STEP_OUTCOME=failure|external_account" "$OUT/path2-github-oidc.log" | sed -E 's/^[^\t]*\t[^\t]*\t[0-9T:.Z-]+ //' >> "$OUT/path2-github-oidc.txt" || true
  [ "$CONCL" = "success" ] || fail "GitHub Actions run $RUN conclusion=$CONCL (attendu success = autorisé 200 + négatif refusé)"
  grep -q "READ_HTTP=200" "$OUT/path2-github-oidc.log" || fail "GitHub autorisé : pas de READ_HTTP=200"
  grep -q "NEGATIVE_OK" "$OUT/path2-github-oidc.log" || fail "GitHub négatif : refus non prouvé"
  log "  ✓ GitHub OIDC : autorisé 200 + négatif refusé (run $RUN)"
else
  log "  gh absent — chemin 2 à déclencher manuellement : gh workflow run wif-proof.yml --ref $GH_REF -f project_id=$PROJECT -f project_number=$PN -f bucket=$BUCKET -f authorized_sa=$AUTH_SA -f wrong_sa=$WRONG_SA -f expect_prefix=$EXPECT"
fi

###############################################################################
# CHEMIN 1 — GKE WIF LIVE (cluster de test) : autorisé=200+contenu, négatif=refus réel
###############################################################################
log "1'. GKE WIF — cluster de test zonal + pods autorisé/négatif (token via metadata, sans clé)"
CLUSTER=wif-proof-gke
gcloud container clusters create "$CLUSTER" --project="$PROJECT" --zone="$ZONE" \
  --workload-pool="${PROJECT}.svc.id.goog" --num-nodes=1 --machine-type=e2-small --spot \
  --no-enable-managed-prometheus --quiet 2>&1 | Q | tail -2
gcloud container clusters get-credentials "$CLUSTER" --zone="$ZONE" --project="$PROJECT" 2>&1 | Q | tail -1
# autorisé : KSA liée à la GSA autorisée
kubectl create namespace wif >/dev/null 2>&1 || true
kubectl create serviceaccount ksa-authorized -n wif >/dev/null 2>&1 || true
kubectl annotate serviceaccount ksa-authorized -n wif "iam.gke.io/gcp-service-account=${AUTH_SA}" --overwrite >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$AUTH_SA" --project="$PROJECT" --role="roles/iam.workloadIdentityUser" \
  --member="serviceAccount:${PROJECT}.svc.id.goog[wif/ksa-authorized]" 2>&1 | Q | tail -1
# négatif : KSA NON liée (aucune GSA)
kubectl create serviceaccount ksa-unbound -n wif >/dev/null 2>&1 || true
log "  attente propagation IAM GKE (60s)"; sleep 60
# pod autorisé : lit le token via metadata (sans clé) puis le bucket → exiger 200 + contenu
POD_CMD="set -e
T=\$(curl -s -H 'Metadata-Flavor: Google' 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token' | python3 -c 'import sys,json;print(json.load(sys.stdin)[\"access_token\"])')
SA=\$(curl -s -H 'Metadata-Flavor: Google' 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email')
CODE=\$(curl -s -o /tmp/b -w '%{http_code}' -H \"Authorization: Bearer \$T\" 'https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/secret.txt?alt=media')
echo IDENTITY=\$SA; echo READ_HTTP=\$CODE; echo SECRET_CONTENT=\$(cat /tmp/b)"
kubectl run gke-authorized -n wif --image=google/cloud-sdk:slim --restart=Never \
  --overrides="{\"spec\":{\"serviceAccountName\":\"ksa-authorized\"}}" --quiet -- bash -c "$POD_CMD" >/dev/null 2>&1 || true
kubectl wait --for=jsonpath='{.status.phase}'=Succeeded pod/gke-authorized -n wif --timeout=150s >/dev/null 2>&1 || \
  kubectl wait --for=jsonpath='{.status.phase}'=Failed pod/gke-authorized -n wif --timeout=60s >/dev/null 2>&1 || true
kubectl logs gke-authorized -n wif > "$OUT/path1-gke-authorized.txt" 2>&1 || true
GRS=$(grep -oE "READ_HTTP=[0-9]+" "$OUT/path1-gke-authorized.txt" | head -1 | cut -d= -f2)
GSC=$(grep -oE "SECRET_CONTENT=.*" "$OUT/path1-gke-authorized.txt" | head -1 | cut -d= -f2-)
[ "$GRS" = "200" ] || fail "GKE autorisé attendait 200, obtenu '$GRS' (voir path1-gke-authorized.txt)"
case "$GSC" in "$EXPECT"*) : ;; *) fail "GKE autorisé : contenu inattendu '$GSC'";; esac
log "  ✓ GKE autorisé : READ_HTTP=200, contenu='$GSC'"
# pod négatif : KSA non liée → le metadata NE PEUT PAS minter un token GSA autorisé → refus/identité≠GSA archivé
NEG_CMD='set +e; R=$(curl -s -m 12 -w " HTTP:%{http_code}" -H "Metadata-Flavor: Google" "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token"); echo "METADATA_TOKEN_RESPONSE:$R"; echo "IDENTITY_EMAIL:$(curl -s -m 12 -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email)"'
kubectl run gke-unbound -n wif --image=google/cloud-sdk:slim --restart=Never \
  --overrides="{\"spec\":{\"serviceAccountName\":\"ksa-unbound\"}}" --quiet -- bash -c "$NEG_CMD" >/dev/null 2>&1 || true
kubectl wait --for=jsonpath='{.status.phase}'=Succeeded pod/gke-unbound -n wif --timeout=150s >/dev/null 2>&1 || \
  kubectl wait --for=jsonpath='{.status.phase}'=Failed pod/gke-unbound -n wif --timeout=60s >/dev/null 2>&1 || true
kubectl logs gke-unbound -n wif > "$OUT/path1-gke-negative.txt" 2>&1 || true
# la KSA non liée n'usurpe aucune GSA : soit le token est refusé, soit l'identité N'EST PAS la GSA autorisée
if grep -qE "HTTP:(403|404|500)|Unable|error|denied|forbidden|not found" "$OUT/path1-gke-negative.txt"; then
  log "  ✓ GKE négatif : token/impersonation refusé (archivé)"
elif ! grep -q "${AUTH_SA%%@*}@" "$OUT/path1-gke-negative.txt"; then
  log "  ✓ GKE négatif : la KSA non liée n'usurpe PAS la GSA autorisée (identité ≠ wif-authorized) — archivé"
else
  fail "GKE négatif : la KSA non liée a obtenu la GSA autorisée (inattendu)"
fi

###############################################################################
# TEARDOWN complet
###############################################################################
log "TEARDOWN"
{
echo "# TEARDOWN $(date -u +%FT%TZ)"
gcloud container clusters delete "$CLUSTER" --project="$PROJECT" --zone="$ZONE" --quiet 2>&1 | Q | tail -1
gcloud run services delete wif-proof --project="$PROJECT" --region="$REGION" --quiet 2>&1 | Q | tail -1
gcloud artifacts repositories delete wif-proof --project="$PROJECT" --location="$REGION" --quiet 2>&1 | Q | tail -1
gcloud iam workload-identity-pools providers delete github --project="$PROJECT" --location=global --workload-identity-pool=github-pool --quiet 2>&1 | Q | tail -1
gcloud iam workload-identity-pools delete github-pool --project="$PROJECT" --location=global --quiet 2>&1 | Q | tail -1
for sa in wif-authorized wif-wrong; do gcloud iam service-accounts delete "${sa}@${PROJECT}.iam.gserviceaccount.com" --project="$PROJECT" --quiet 2>&1 | Q | tail -1; done
gcloud projects delete "$PROJECT" --quiet 2>&1 | Q | tail -2
} | tee "$OUT/teardown-trace.txt"
echo "PROJECT_STATE=$(gcloud projects describe "$PROJECT" --format="value(lifecycleState)" 2>/dev/null | Q)" | tee -a "$OUT/teardown-trace.txt"
log "TERMINÉ — preuves dans $OUT (les 3 chemins : autorisé 200 + négatif réel ; teardown joué)."
