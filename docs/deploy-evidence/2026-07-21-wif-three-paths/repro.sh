#!/usr/bin/env bash
###############################################################################
# WIF — preuve REJOUABLE FAIL-CLOSED des 3 chemins d'identité (P0-A2-09).
#
# Corrections expert V3 §P0-A2-09 :
#  (1) gh OBLIGATOIRE (préflight) avant tout provisioning ;
#  (2) run GitHub suivi par NONCE EXACT (jamais « le plus récent ») ;
#  (3) négatif GKE = refus IAM PRÉCIS 401/403 + contenu de refus contrôlé
#      (000/404/5xx ne prouve RIEN → échec) ;
#  (4) trap de teardown ARMÉ *AVANT* `gcloud projects create` ET
#      `gcloud billing projects link` (correction expert RR-20260723-CODEX-07) :
#      si la liaison billing échoue sous set -e, le trap EXIT nettoie quand même
#      le projet créé. Teardown idempotent ET SÛR si le projet n'existe pas encore.
#  (5) rejoue les 3 chemins et archive le nouveau run.
#
# Corrections expert RR-20260723-CODEX-08 (RR-08) §P0-A2-09 — teardown FAIL-CLOSED
# (logique dans teardown-lib.sh, testée par mock gcloud dans teardown-lib.spec.sh) :
#  (a) un échec de `gcloud projects describe` n'est PLUS lu comme « projet absent » :
#      le motif d'erreur est parsé pour distinguer un NOT_FOUND *authentifié* des
#      erreurs transitoires / de permission ;
#  (b) `describe` est RÉESSAYÉ sur erreurs transitoires ;
#  (c) `gcloud projects delete` est TENTÉ même si l'état est illisible (UNKNOWN) ;
#  (d) le REÇU de nettoyage ÉCHOUE (exit != 0) si l'état final n'est ni
#      DELETE_REQUESTED ni un NOT_FOUND authentifié.
#
# Projet de TEST dédié (jamais la prod). Zéro clé de service. Coût cible ~0 $.
# Prérequis : gcloud (admin org), docker, gh (openaxcloud/vibecore), kubectl,
#             CLOUDSDK_PYTHON=python3.10+ (gcloud run/storage crashe en 3.9).
###############################################################################
set -Eeuo pipefail

: "${CLOUDSDK_PYTHON:?export CLOUDSDK_PYTHON=/opt/homebrew/bin/python3.12 (gcloud run/storage crashe sous Python 3.9)}"
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

# ---- PRÉFLIGHT FAIL-CLOSED : outils + auth OBLIGATOIRES avant tout provisioning ----
for t in gcloud docker kubectl gh curl "$CLOUDSDK_PYTHON"; do
  command -v "$t" >/dev/null 2>&1 || { echo "PREFLIGHT FAIL: outil requis absent: $t"; exit 1; }
done
gh auth status >/dev/null 2>&1 || { echo "PREFLIGHT FAIL: gh non authentifié — 'gh auth login' requis AVANT provisioning"; exit 1; }
gh auth token >/dev/null 2>&1 || { echo "PREFLIGHT FAIL: gh sans token utilisable"; exit 1; }
gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | grep -q . \
  || { echo "PREFLIGHT FAIL: gcloud sans compte actif"; exit 1; }
echo "PREFLIGHT OK: gcloud/docker/kubectl/gh(authentifié)/curl/python présents"

# ---- paramètres (surchargeables) -------------------------------------------
FOLDER="${WIF_TEST_FOLDER:-780512954993}"
BILLING="${WIF_BILLING:-019D6D-45FBC1-89F220}"
REGION="${WIF_REGION:-europe-west9}"
ZONE="${WIF_ZONE:-europe-west9-a}"
REPO="${WIF_GH_REPO:-openaxcloud/vibecore}"
GH_REF="${WIF_GH_REF:-feat/wif-three-paths-replayable}"
CLUSTER=wif-proof-gke
NONCE="wifproof-$(date -u +%Y%m%dT%H%M%SZ)-$$"   # identifiant UNIQUE du dispatch
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${WIF_OUT:-$HERE/replay-$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$OUT"
log(){ echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$OUT/run.log"; }
Q(){ grep -vE "WARNING|Python 3|reinstall|CLOUDSDK|compatible Python|gcloud components|NotOpenSSL|warnings.warn|urllib3|importlib|^\s*$" || true; }
fail(){ echo "ASSERTION FAILED: $*" | tee -a "$OUT/run.log"; exit 1; }
retry(){ local n=0 max="${RETRY_MAX:-8}"; until "$@"; do n=$((n+1)); [ "$n" -ge "$max" ] && return 1; sleep 12; done; }

# Logique de teardown FAIL-CLOSED (corrections RR-08 : describe classé/réessayé,
# delete tenté même si état illisible, reçu de nettoyage fail-closed). Testée en
# isolation via mock gcloud dans teardown-lib.spec.sh.
source "$HERE/teardown-lib.sh"

# ---- 0. provisioning : TRAP TEARDOWN armé AVANT toute ressource facturable --
# Correction expert RR-20260723-CODEX-07 : l'ID du projet est calculé D'ABORD,
# puis le `trap teardown EXIT` est armé AVANT `gcloud projects create` ET AVANT
# `gcloud billing projects link`. Ainsi, si la liaison billing échoue sous set -e
# (le script sortirait immédiatement), le trap EXIT nettoie tout de même le projet
# déjà créé → 0 ressource facturable résiduelle.
log "0. idempotence : projets ecode-wif-proof-* ACTIFS ?"
EXISTING=$(gcloud projects list --filter="projectId:ecode-wif-proof-* AND lifecycleState:ACTIVE" --format="value(projectId)" 2>/dev/null | Q | head -1 || true)
if [ -n "$EXISTING" ]; then PROJECT="$EXISTING"; PROJECT_PREEXISTING=1; else
  PROJECT="ecode-wif-proof-$(date +%s | tail -c 7)"; PROJECT_PREEXISTING=0
fi

# Suppression des sous-ressources (best-effort ; le projects delete emporte le reste).
_wif_subres_delete(){
  gcloud container clusters delete "$CLUSTER" --project="$PROJECT" --zone="$ZONE" --quiet 2>&1 | Q | tail -1 || true
  gcloud run services delete wif-proof --project="$PROJECT" --region="$REGION" --quiet 2>&1 | Q | tail -1 || true
  gcloud artifacts repositories delete wif-proof --project="$PROJECT" --location="$REGION" --quiet 2>&1 | Q | tail -1 || true
  gcloud iam workload-identity-pools providers delete github --project="$PROJECT" --location=global --workload-identity-pool=github-pool --quiet 2>&1 | Q | tail -1 || true
  gcloud iam workload-identity-pools delete github-pool --project="$PROJECT" --location=global --quiet 2>&1 | Q | tail -1 || true
  for sa in wif-authorized wif-wrong; do gcloud iam service-accounts delete "${sa}@${PROJECT}.iam.gserviceaccount.com" --project="$PROJECT" --quiet 2>&1 | Q | tail -1 || true; done
}

# TEARDOWN FAIL-CLOSED (RR-08) : un échec de `describe` n'est PLUS lu comme « absent ».
# wif_teardown_project classe l'état (retry sur transitoire), TENTE le delete même si
# l'état est illisible, et n'émet CLEANUP_RECEIPT=OK que sur DELETE_REQUESTED ou
# NOT_FOUND authentifié — sinon le reçu ÉCHOUE et le script sort en erreur (fail-closed).
TEARDOWN_DONE=0
teardown(){
  local rc=$?
  [ "$TEARDOWN_DONE" = 1 ] && return; TEARDOWN_DONE=1
  local trace="$OUT/teardown-trace.txt"
  { echo "# TEARDOWN $(date -u +%FT%TZ) (exit rc=$rc)"
    wif_teardown_project "$PROJECT" _wif_subres_delete
  } | tee "$trace"
  # Fail-closed : si le reçu de nettoyage a échoué, propager un exit non-zéro
  # (sans masquer un rc d'origine déjà non-zéro).
  if grep -q "CLEANUP_RECEIPT=FAILED" "$trace" 2>/dev/null; then
    echo "TEARDOWN_FAIL_CLOSED=1 (reçu de nettoyage en échec — projet potentiellement non supprimé)" | tee -a "$trace"
    [ "$rc" -eq 0 ] && exit 1
  fi
}
trap teardown EXIT
log "  trap teardown ARMÉ AVANT create/billing (projet $PROJECT) — nettoyage garanti même si la liaison billing échoue"

# Création + liaison billing APRÈS l'armement du trap : toute erreur ici est rattrapée.
if [ "$PROJECT_PREEXISTING" = 1 ]; then
  log "  réutilise $PROJECT (déjà ACTIF)"
else
  log "  crée $PROJECT sous folder $FOLDER"
  gcloud projects create "$PROJECT" --folder="$FOLDER" --name="ECode WIF Proof" 2>&1 | Q | tail -1
  gcloud billing projects link "$PROJECT" --billing-account="$BILLING" 2>&1 | Q | tail -1
fi

PN=$(gcloud projects describe "$PROJECT" --format="value(projectNumber)" 2>/dev/null | Q)
BUCKET="${PROJECT}-secret-data"; AUTH_SA="wif-authorized@${PROJECT}.iam.gserviceaccount.com"; WRONG_SA="wif-wrong@${PROJECT}.iam.gserviceaccount.com"
EXPECT="wif-proof-secret-content"
echo "PROJECT=$PROJECT PROJECT_NUMBER=$PN BUCKET=$BUCKET NONCE=$NONCE" | tee "$OUT/params.env"

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
retry gcloud iam service-accounts describe "$AUTH_SA" --project="$PROJECT" >/dev/null 2>&1 || fail "SA wif-authorized jamais propagée"
retry gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:${AUTH_SA}" --role="roles/storage.objectViewer" >/dev/null 2>&1 || fail "binding objectViewer (propagation)"
gcloud projects get-iam-policy "$PROJECT" --format=json 2>/dev/null > "$OUT/policy.json"
"$CLOUDSDK_PYTHON" -c 'import json,sys;p=json.load(open(sys.argv[1]));p["auditConfigs"]=[{"service":"allServices","auditLogConfigs":[{"logType":"DATA_READ"},{"logType":"DATA_WRITE"}]}];json.dump(p,open(sys.argv[2],"w"))' "$OUT/policy.json" "$OUT/policy2.json"
gcloud projects set-iam-policy "$PROJECT" "$OUT/policy2.json" 2>&1 | Q | tail -1 >/dev/null

###############################################################################
# CHEMIN 3 — Cloud Run metadata (aucune clé) : autorisé=200+contenu, négatif=403
###############################################################################
log "3. Cloud Run — build image + deploy + preuves"
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
curl -s --max-time 30 "$URL/" -o "$OUT/path3-cloudrun-authorized.json" || fail "curl cloudrun authorized"
RS=$("$CLOUDSDK_PYTHON" -c 'import json,sys;print(json.load(open(sys.argv[1])).get("read_status"))' "$OUT/path3-cloudrun-authorized.json")
SC=$("$CLOUDSDK_PYTHON" -c 'import json,sys;print(json.load(open(sys.argv[1])).get("secret",""))' "$OUT/path3-cloudrun-authorized.json")
[ "$RS" = "200" ] || fail "Cloud Run autorisé attendait 200, obtenu $RS"
case "$SC" in "$EXPECT"*) : ;; *) fail "Cloud Run autorisé : contenu inattendu '$SC'";; esac
log "  ✓ Cloud Run autorisé : read_status=200, contenu='$SC'"
gcloud run services update wif-proof --project="$PROJECT" --region="$REGION" --service-account="$WRONG_SA" --quiet 2>&1 | Q | tail -1
sleep 4
curl -s --max-time 30 "$URL/" -o "$OUT/path3-cloudrun-negative.json" || fail "curl cloudrun negative"
RSN=$("$CLOUDSDK_PYTHON" -c 'import json,sys;print(json.load(open(sys.argv[1])).get("read_status"))' "$OUT/path3-cloudrun-negative.json")
[ "$RSN" = "403" ] || fail "Cloud Run négatif attendait 403, obtenu $RSN"
log "  ✓ Cloud Run négatif : read_status=403 (refusé)"

###############################################################################
# CHEMIN 2 — WIF externe GitHub OIDC : run suivi par NONCE EXACT
###############################################################################
log "2. WIF externe GitHub OIDC — pool/provider/grants + run dispatché suivi par nonce"
gcloud iam workload-identity-pools create github-pool --project="$PROJECT" --location=global --display-name="GitHub OIDC" 2>&1 | Q | tail -1 || true
gcloud iam workload-identity-pools providers create-oidc github --project="$PROJECT" --location=global \
  --workload-identity-pool=github-pool --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='${REPO}'" --display-name="GitHub Actions" 2>&1 | Q | tail -1 || true
MEMBER="principalSet://iam.googleapis.com/projects/${PN}/locations/global/workloadIdentityPools/github-pool/attribute.repository/${REPO}"
retry gcloud iam service-accounts add-iam-policy-binding "$AUTH_SA" --project="$PROJECT" --role="roles/iam.workloadIdentityUser" --member="$MEMBER" >/dev/null 2>&1 || fail "grant workloadIdentityUser (GitHub)"
retry gcloud iam service-accounts add-iam-policy-binding "$AUTH_SA" --project="$PROJECT" --role="roles/iam.serviceAccountTokenCreator" --member="$MEMBER" >/dev/null 2>&1 || fail "grant serviceAccountTokenCreator (GitHub)"
log "  attente propagation IAM (90s)"; sleep 90
# dispatch AVEC nonce → le workflow porte run-name=... $NONCE ; on RÉCUPÈRE l'id EXACT.
gh workflow run wif-proof.yml --ref "$GH_REF" -R "$REPO" \
  -f nonce="$NONCE" -f project_id="$PROJECT" -f project_number="$PN" -f bucket="$BUCKET" \
  -f authorized_sa="$AUTH_SA" -f wrong_sa="$WRONG_SA" -f expect_prefix="$EXPECT" 2>&1 | Q | tail -1 \
  || fail "gh workflow run (workflow doit exister sur $GH_REF et être dispatchable)"
RUN=""
for i in $(seq 1 40); do
  RUN=$(gh run list --workflow=wif-proof.yml -R "$REPO" --limit 30 --json databaseId,displayTitle \
        --jq "[.[] | select((.displayTitle // \"\") | contains(\"$NONCE\"))][0].databaseId" 2>/dev/null || true)
  [ -n "$RUN" ] && [ "$RUN" != "null" ] && break
  RUN=""; sleep 6
done
[ -n "$RUN" ] || fail "run dispatché introuvable par nonce=$NONCE (aucun run le plus récent pris par défaut)"
log "  run dispatché EXACT=$RUN (nonce=$NONCE), attente..."
until [ "$(gh run view "$RUN" -R "$REPO" --json status --jq .status)" = "completed" ]; do sleep 10; done
gh run view "$RUN" -R "$REPO" --log > "$OUT/path2-github-oidc.log" 2>/dev/null || true
CONCL=$(gh run view "$RUN" -R "$REPO" --json conclusion,displayTitle --jq '.conclusion')
TITLE=$(gh run view "$RUN" -R "$REPO" --json displayTitle --jq '.displayTitle')
echo "run=$RUN nonce=$NONCE displayTitle=$TITLE conclusion=$CONCL url=https://github.com/$REPO/actions/runs/$RUN" > "$OUT/path2-github-oidc.txt"
grep -E "READ_HTTP=200|SECRET_CONTENT=|NEGATIVE_OK|AUTH_STEP_OUTCOME=failure|external_account|NONCE=" "$OUT/path2-github-oidc.log" | sed -E 's/^[^\t]*\t[^\t]*\t[0-9T:.Z-]+ //' >> "$OUT/path2-github-oidc.txt" || true
case "$TITLE" in *"$NONCE"*) : ;; *) fail "run $RUN displayTitle ne porte pas le nonce ($TITLE) — mauvais run";; esac
[ "$CONCL" = "success" ] || fail "GitHub run $RUN conclusion=$CONCL (attendu success)"
grep -q "READ_HTTP=200" "$OUT/path2-github-oidc.log" || fail "GitHub autorisé : pas de READ_HTTP=200"
grep -q "NEGATIVE_OK" "$OUT/path2-github-oidc.log" || fail "GitHub négatif : refus non prouvé"
log "  ✓ GitHub OIDC : run EXACT $RUN (nonce vérifié) — autorisé 200 + négatif refusé"

###############################################################################
# CHEMIN 1 — GKE WIF LIVE : autorisé=200+contenu, négatif=refus IAM PRÉCIS 401/403
###############################################################################
log "1'. GKE WIF — cluster de test + pods autorisé/négatif (token metadata, sans clé)"
gcloud container clusters create "$CLUSTER" --project="$PROJECT" --zone="$ZONE" \
  --workload-pool="${PROJECT}.svc.id.goog" --num-nodes=1 --machine-type=e2-small --spot \
  --no-enable-managed-prometheus --quiet 2>&1 | Q | tail -2
gcloud container clusters get-credentials "$CLUSTER" --zone="$ZONE" --project="$PROJECT" 2>&1 | Q | tail -1
kubectl create namespace wif >/dev/null 2>&1 || true
kubectl create serviceaccount ksa-authorized -n wif >/dev/null 2>&1 || true
kubectl annotate serviceaccount ksa-authorized -n wif "iam.gke.io/gcp-service-account=${AUTH_SA}" --overwrite >/dev/null
retry gcloud iam service-accounts add-iam-policy-binding "$AUTH_SA" --project="$PROJECT" --role="roles/iam.workloadIdentityUser" \
  --member="serviceAccount:${PROJECT}.svc.id.goog[wif/ksa-authorized]" >/dev/null 2>&1 || fail "grant workloadIdentityUser (GKE KSA)"
kubectl create serviceaccount ksa-unbound -n wif >/dev/null 2>&1 || true
# krun_pod POD KSA CMD — crée le pod avec retries et NE PAS avaler l'erreur (un
# `kubectl run` qui échoue silencieusement donnait « pods not found » → READ_HTTP vide
# → faux échec de chemin). stderr capturé dans $OUT/POD.run.log.
krun_pod(){
  local pod="$1" ksa="$2" cmd="$3" i
  for i in 1 2 3; do
    kubectl delete pod "$pod" -n wif --ignore-not-found >/dev/null 2>&1 || true
    if kubectl run "$pod" -n wif --image=google/cloud-sdk:slim --restart=Never \
         --overrides="{\"spec\":{\"serviceAccountName\":\"$ksa\"}}" --quiet -- bash -c "$cmd" \
         > "$OUT/${pod}.run.log" 2>&1; then return 0; fi
    sleep 12
  done
  return 1
}
log "  attente propagation IAM GKE (60s)"; sleep 60
POD_CMD="set -e
T=\$(curl -s -H 'Metadata-Flavor: Google' 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token' | python3 -c 'import sys,json;print(json.load(sys.stdin)[\"access_token\"])')
SA=\$(curl -s -H 'Metadata-Flavor: Google' 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email')
CODE=\$(curl -s -o /tmp/b -w '%{http_code}' -H \"Authorization: Bearer \$T\" 'https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/secret.txt?alt=media')
echo IDENTITY=\$SA; echo READ_HTTP=\$CODE; echo SECRET_CONTENT=\$(cat /tmp/b)"
krun_pod gke-authorized ksa-authorized "$POD_CMD" || fail "kubectl run gke-authorized a échoué après retries (voir gke-authorized.run.log)"
kubectl wait --for=jsonpath='{.status.phase}'=Succeeded pod/gke-authorized -n wif --timeout=150s >/dev/null 2>&1 || \
  kubectl wait --for=jsonpath='{.status.phase}'=Failed pod/gke-authorized -n wif --timeout=60s >/dev/null 2>&1 || true
kubectl logs gke-authorized -n wif > "$OUT/path1-gke-authorized.txt" 2>&1 || true
GRS=$(grep -oE "READ_HTTP=[0-9]+" "$OUT/path1-gke-authorized.txt" | head -1 | cut -d= -f2)
GSC=$(grep -oE "SECRET_CONTENT=.*" "$OUT/path1-gke-authorized.txt" | head -1 | cut -d= -f2-)
[ "$GRS" = "200" ] || fail "GKE autorisé attendait 200, obtenu '$GRS' (voir path1-gke-authorized.txt)"
case "$GSC" in "$EXPECT"*) : ;; *) fail "GKE autorisé : contenu inattendu '$GSC'";; esac
log "  ✓ GKE autorisé : READ_HTTP=200, contenu='$GSC'"
# NÉGATIF : KSA non liée → identité = défaut du pool ; on EXIGE un refus IAM PRÉCIS 401/403
# + un corps de refus contrôlé. Un 000/404/5xx ne prouve PAS un refus IAM → échec.
NEG_CMD="set +e
T=\$(curl -s -m 12 -H 'Metadata-Flavor: Google' 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token' | python3 -c 'import sys,json;print(json.load(sys.stdin).get(\"access_token\",\"\"))' 2>/dev/null)
SA=\$(curl -s -m 12 -H 'Metadata-Flavor: Google' 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email')
echo IDENTITY_EMAIL:\$SA
CODE=\$(curl -s -m 20 -o /tmp/b -w '%{http_code}' -H \"Authorization: Bearer \$T\" 'https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/secret.txt?alt=media')
echo BUCKET_READ_HTTP:\$CODE
echo BUCKET_READ_BODY:\$(head -c 400 /tmp/b)"
krun_pod gke-unbound ksa-unbound "$NEG_CMD" || fail "kubectl run gke-unbound a échoué après retries (voir gke-unbound.run.log)"
kubectl wait --for=jsonpath='{.status.phase}'=Succeeded pod/gke-unbound -n wif --timeout=150s >/dev/null 2>&1 || \
  kubectl wait --for=jsonpath='{.status.phase}'=Failed pod/gke-unbound -n wif --timeout=60s >/dev/null 2>&1 || true
kubectl logs gke-unbound -n wif > "$OUT/path1-gke-negative.txt" 2>&1 || true
NEG_CODE=$(grep -oE "BUCKET_READ_HTTP:[0-9]+" "$OUT/path1-gke-negative.txt" | head -1 | cut -d: -f2)
NEG_ID=$(grep -oE "IDENTITY_EMAIL:.*" "$OUT/path1-gke-negative.txt" | head -1 | cut -d: -f2-)
NEG_BODY=$(grep -oE "BUCKET_READ_BODY:.*" "$OUT/path1-gke-negative.txt" | head -1 | cut -d: -f2-)
[ -n "$NEG_CODE" ] || fail "GKE négatif : pas de tentative de lecture archivée"
case "$NEG_CODE" in
  401|403) : ;;  # refus IAM attendu
  *) fail "GKE négatif : refus IAM PRÉCIS attendu (401/403), obtenu '$NEG_CODE' — un 000/404/5xx ne prouve pas un refus IAM";;
esac
echo "$NEG_BODY" | grep -qiE "does not have storage.objects.get|storage.objects.get.*denied|permission.*denied|forbidden|unauthorized|invalid.*credential|anonymous caller" \
  || fail "GKE négatif : corps de refus IAM non contrôlé (attendu message permission-denied) : '$NEG_BODY'"
case "$NEG_ID" in *"${AUTH_SA}"*) fail "GKE négatif : la KSA non liée a obtenu la GSA autorisée (inattendu)";; esac
log "  ✓ GKE négatif : refus IAM PRÉCIS HTTP=$NEG_CODE + corps permission-denied contrôlé ; identité=$NEG_ID (≠ GSA autorisée)"

log "TOUS LES CHEMINS PROUVÉS — teardown va s'exécuter (trap EXIT)."
# le teardown est joué automatiquement par le trap EXIT ci-dessus.
