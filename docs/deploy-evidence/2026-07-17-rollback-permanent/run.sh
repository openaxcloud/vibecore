#!/usr/bin/env bash
# Live proof: server rollback re-deploys the retained image BY DIGEST after the
# current revision is deleted (I-REL-1). Runs against prod api.e-code.ai.
set -uo pipefail
API="https://api.e-code.ai"
EV="$(cd "$(dirname "$0")" && pwd)"
NS_API=vibecore
NS_WS=workspaces
J() { python3 -c "import sys,json
try:
 d=json.load(sys.stdin); print(eval('d'+sys.argv[1]))
except Exception: print('')" "$1"; }
log() { echo "[$(date -u +%H:%M:%S)] $*"; }

RID="rbk$(date +%s)"
EMAIL="rollback-proof-${RID}@e-code.local"
lc() { echo "$1" | tr 'A-Z' 'a-z'; }

log "1. register user ${EMAIL}"
REG=$(curl -s -X POST "$API/auth/register" -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"RollbackProof!12345\",\"name\":\"Rollback Proof\",\"organizationName\":\"Rollback Proof ${RID}\"}")
echo "$REG" > "$EV/01-register.json"
TOKEN=$(echo "$REG" | J "['token']"); ORG=$(echo "$REG" | J "['organization']['id']")
[ -z "$TOKEN" ] && { echo "register failed: $REG"; exit 1; }
log "   org=$ORG token=${TOKEN:0:14}…"
AUTH=(-H "authorization: Bearer $TOKEN" -H 'content-type: application/json')

log "2. grant deployments.count quota (QuotaOverride) for the throwaway org"
POD=$(kubectl -n $NS_API get pods -l app.kubernetes.io/component=api -o jsonpath='{.items[0].metadata.name}')
kubectl -n $NS_API exec "$POD" -c api -- env OV_ORG="$ORG" node -e '
const {Client}=require("pg");
(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();
const id="qov"+Math.random().toString(36).slice(2,14);
await c.query(`insert into "QuotaOverride"(id,"organizationId",key,"limit",reason,"expiresAt","createdAt") values($1,$2,$3,$4,$5,$6,now())`,
 [id,process.env.OV_ORG,"deployments.count",1000,"rollback-live-proof",new Date(Date.now()+864e5)]);
console.log("QuotaOverride granted",id);await c.end();})().catch(e=>{console.error(e.message);process.exit(1)});
' 2>&1 | tee "$EV/02-grant-quota.txt"

log "3. create project"
PROJ=$(curl -s -X POST "$API/orgs/$ORG/projects" "${AUTH[@]}" -d "{\"name\":\"Rollback Proof ${RID}\"}")
echo "$PROJ" > "$EV/03-project.json"; PID=$(echo "$PROJ" | J "['project']['id']")
log "   projectId=$PID"

log "4. boot workspace"
WS=$(curl -s -X POST "$API/api/runtime/workspaces" "${AUTH[@]}" -d "{\"projectId\":\"$PID\"}")
echo "$WS" > "$EV/04-workspace.json"; WSID=$(echo "$WS" | J "['id']")
for i in $(seq 1 30); do ST=$(curl -s "$API/api/runtime/workspaces/$WSID/status" "${AUTH[@]}" | J "['status']"); [ "$ST" = "running" ] && break; sleep 4; done
log "   workspaceId=$WSID status=$ST"

writefile() { # path content  -> http code
  WF_PATH="$1" WF_CONTENT="$2" python3 -c 'import json,os;print(json.dumps({"path":os.environ["WF_PATH"],"content":os.environ["WF_CONTENT"]}))' > /tmp/wf.json
  curl -s -o /dev/null -w "%{http_code}" -X PUT "$API/api/runtime/workspaces/$WSID/files/write" "${AUTH[@]}" --data @/tmp/wf.json
}

PKG='{"name":"rollback-proof","version":"1.0.0","private":true,"scripts":{"start":"node server.js"}}'
DEPLOYJSON='{"run":"node server.js"}'
SV1='const http=require("http");const V="v1";const P=process.env.PORT||3000;http.createServer((q,r)=>{r.writeHead(200,{"content-type":"text/plain"});r.end("ROLLBACK-PROOF "+V+"\n")}).listen(P,()=>console.log("up",P,V));'
SV2='const http=require("http");const V="v2";const P=process.env.PORT||3000;http.createServer((q,r)=>{r.writeHead(200,{"content-type":"text/plain"});r.end("ROLLBACK-PROOF "+V+"\n")}).listen(P,()=>console.log("up",P,V));'

log "5. write v1 app files"
log "   package.json=$(writefile package.json "$PKG") deploy.json=$(writefile .ecode/deploy.json "$DEPLOYJSON") server.js=$(writefile server.js "$SV1")"

# deploy is ASYNC: POST returns {deployment:{status:QUEUED}}, a BullMQ worker
# builds it (runDeploymentBuildFlow — where the digest is captured). Poll to READY.
deploy() { curl -s -X POST "$API/projects/$PID/deployments" "${AUTH[@]}" --max-time 60 -d '{"provider":"server","environment":"preview"}'; }
poll() { # id label -> writes row-<label>.json, echoes final status
  local id="$1" label="$2"
  for i in $(seq 1 90); do
    curl -s "$API/projects/$PID/deployments/$id" "${AUTH[@]}" > "$EV/row-$label.json"
    local st=$(cat "$EV/row-$label.json" | J "['deployment']['status']")
    case "$st" in READY|FAILED) echo "$st"; return;; esac
    sleep 5
  done
  echo "TIMEOUT"
}

log "6. deploy v1 (async build ~90-180s) — must reach READY BEFORE writing v2"
V1=$(deploy | J "['deployment']['id']")
V1ST=$(poll "$V1" v1)
DIGEST_V1=$(cat "$EV/row-v1.json" | J "['deployment']['metadata']['serverDeploy']['image']['imageDigest']")
URL_V1="https://d-$(lc "$V1").preview.e-code.ai"
log "   v1=$V1 status=$V1ST digest=$DIGEST_V1"
log "   v1 body: $(curl -s --max-time 25 "$URL_V1/" | head -1)"

log "7. NOW write v2 (v1 already built) + deploy v2"
writefile server.js "$SV2" >/dev/null
V2=$(deploy | J "['deployment']['id']")
V2ST=$(poll "$V2" v2)
DIGEST_V2=$(cat "$EV/row-v2.json" | J "['deployment']['metadata']['serverDeploy']['image']['imageDigest']")
URL_V2="https://d-$(lc "$V2").preview.e-code.ai"
log "   v2=$V2 status=$V2ST digest=$DIGEST_V2"
log "   v2 body: $(curl -s --max-time 25 "$URL_V2/" | head -1)"

log "8. DELETE v1's revision (kubectl delete deploy app-$(lc "$V1") in $NS_WS)"
kubectl -n $NS_WS delete deployment "app-$(lc "$V1")" --ignore-not-found 2>&1 | tee "$EV/08-delete-v1-revision.txt"
kubectl -n $NS_WS get deploy "app-$(lc "$V1")" 2>&1 | tee -a "$EV/08-delete-v1-revision.txt"
log "   v1 url after delete: HTTP $(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$URL_V1/") (expect non-200)"

log "9. ROLLBACK to v1 (must re-pull digest_v1 into a NEW deployment)"
curl -s -X POST "$API/projects/$PID/deployments/$V1/rollback" "${AUTH[@]}" -d '{}' --max-time 300 > "$EV/09-rollback.json"
RBID=$(cat "$EV/09-rollback.json" | J "['deployment']['id']")
RB_DIGEST=$(cat "$EV/09-rollback.json" | J "['deployment']['metadata']['serverDeploy']['rolledBackFromDigest']")
RBST=$(cat "$EV/09-rollback.json" | J "['deployment']['status']")
[ -n "$RBID" ] && [ "$RBST" != "READY" ] && RBST=$(poll "$RBID" rollback) && RB_DIGEST=$(cat "$EV/row-rollback.json" | J "['deployment']['metadata']['serverDeploy']['rolledBackFromDigest']")
URL_RB="https://d-$(lc "$RBID").preview.e-code.ai"
log "   rollback=$RBID status=$RBST rolledBackFromDigest=$RB_DIGEST (==digest_v1? $([ -n "$DIGEST_V1" ] && [ "$RB_DIGEST" = "$DIGEST_V1" ] && echo YES || echo NO))"
# give the re-deployed pod a moment to become ready, then read the body
B=""; for i in $(seq 1 30); do B=$(curl -s --max-time 20 "$URL_RB/" | head -1); echo "$B" | grep -q "ROLLBACK-PROOF" && break; sleep 5; done
log "   rollback body: $B  (expect ROLLBACK-PROOF v1)"

{ echo "v1=$V1 digest=$DIGEST_V1 body_before=ROLLBACK-PROOF v1"
  echo "v2=$V2 digest=$DIGEST_V2"
  echo "rollback=$RBID rolledBackFromDigest=$RB_DIGEST body_after=$B"
} | tee "$EV/SUMMARY.txt"
log "DONE"
