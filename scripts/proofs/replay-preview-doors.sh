#!/usr/bin/env bash
# Rejeu LIVE des 4 portes d'accès à un preview, sur l'environnement d'audit.
#
#   scripts/proofs/replay-preview-doors.sh <tag-image-attendu>
#
# Ce que ça monte, en réel : une organisation, un projet, un workspace en pod
# gVisor, un vrai serveur de dev (HTTP sur 5173, HTTP+WebSocket sur 5174), puis
# les 4 portes sont sollicitées avec un jeton LÉGITIME, un jeton INTRUS, un jeton
# BIDON et SANS jeton. Les jetons sont forgés DANS le cluster : le secret HMAC ne
# sort jamais.
#
# PRÉCAUTIONS, dans cet ordre — chacune a déjà produit une fausse preuve :
#   1. cible épinglée et identité du cluster prouvée (jamais la prod) ;
#   2. le tag d'image attendu est vérifié sur CHAQUE réplique — une réplique
#      restée sur l'ancienne image avait renvoyé un 200 trompeur, lu à tort comme
#      une fuite inter-tenant ;
#   3. les drapeaux d'enforcement sont vérifiés sur CHAQUE réplique du proxy ;
#   4. les requêtes partent de l'INTÉRIEUR du cluster, comme les vrais appelants
#      (le screenshotter ne peut pas poser d'en-tête `Host`, le navigateur non plus).
# Les guillemets SIMPLES sont voulus partout ou un `$VAR` doit etre resolu DANS le
# pod (secrets d'environnement du cluster) et non sur la machine qui lance le
# script — c'est la propriete recherchee, pas un oubli.
# shellcheck disable=SC2016
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

# shellcheck source=scripts/audit-env/lib.sh
source "$REPO/scripts/audit-env/lib.sh"

EXPECTED_TAG="${1:?usage: replay-preview-doors.sh <tag-image-attendu>}"
NS=vibecore
RUNTIME_NS=workspaces
ORG_OK='org_porte'
ORG_PIRATE='org_pirate'
PROJ='proj_porte'
WS='ws-porte'
# Le POD ne porte pas l'id du workspace : le manager le prefixe. Attendre
# `pod/ws-porte` echouait donc silencieusement (« pod introuvable »).
WS_POD="workspace-$WS"

OUT="${OUT:-/tmp/portes-preview-$EXPECTED_TAG.txt}"

audit_env_pin_cluster_target
audit_env_require_audit_cluster

k() { audit_kubectl -n "$NS" "$@"; }

say() { printf '%s\n' "$*" | tee -a "$OUT"; }
: > "$OUT"

say "############ REJEU LIVE DES 4 PORTES ############"
say "date: $(date -u +%FT%TZ)   tag attendu: $EXPECTED_TAG"
say "cluster: $AUDIT_KUBE_CONTEXT"
say

# --- 2. la flotte tourne-t-elle TOUTE le tag attendu ? ----------------------
#
# PORTEE : les composants que les 4 portes TRAVERSENT reellement — le proxy (qui
# tient la porte), l'api (verdict des ports prives) et le workspace-manager
# (resolution d'agent + propriete de l'org). Le tier `web` en est volontairement
# exclu : aucune porte ne passe par lui, et l'inclure rendait la preuve otage d'un
# travail concurrent sans rapport sur le meme cluster d'audit (une autre session y
# poussait ses propres images `web` a la main pendant la mesure).
say "== flotte (composants traverses par les portes) =="
fleet_ok=1
for comp in api preview-proxy workspace-manager; do
  tags="$(k get pods -l "app.kubernetes.io/component=$comp" \
    -o jsonpath='{range .items[*]}{.spec.containers[0].image}{"\n"}{end}' | sed 's/.*://' | sort -u)"
  n="$(k get pods -l "app.kubernetes.io/component=$comp" --no-headers 2>/dev/null | grep -c .)"
  say "  $comp: $n replique(s), tag(s)=$(echo "$tags" | tr '\n' ' ')"

  if [[ "$tags" != "$EXPECTED_TAG" ]]; then
    say "  !! $comp ne tourne pas UNIQUEMENT $EXPECTED_TAG"
    fleet_ok=0
  fi
done

if [[ "$fleet_ok" != "1" ]]; then
  say "REFUS: la flotte n'est pas homogene sur le tag attendu — toute mesure serait ambigue."
  exit 1
fi

# --- 3. drapeaux d'enforcement, sur chaque replique du proxy ----------------
say
say "== drapeaux (lus dans CHAQUE pod du proxy, pas dans le configmap) =="
flags_ok=1
for pod in $(k get pods -l app.kubernetes.io/component=preview-proxy -o jsonpath='{.items[*].metadata.name}'); do
  vals="$(k exec "$pod" -- sh -lc 'echo "TENANT=${PREVIEW_PROXY_ENFORCE_TENANT:-vide} PRIVATE=${PREVIEW_ENFORCE_PRIVATE_PORTS:-vide}"' 2>/dev/null)"
  say "  $pod: $vals"
  [[ "$vals" == *"TENANT=true"* ]] || flags_ok=0
done

if [[ "$flags_ok" != "1" ]]; then
  say "REFUS: l'enforcement tenant n'est pas actif sur toutes les repliques du proxy."
  exit 1
fi

API_POD="$(k get pods -l app.kubernetes.io/component=api -o jsonpath='{.items[0].metadata.name}')"
PROXY_SVC="http://vibecore-vibecore-platform-preview-proxy.$NS.svc.cluster.local:3020"
WSM_SVC="http://vibecore-vibecore-platform-workspace-manager.$NS.svc.cluster.local:3010"

# --- 4. semer org + projet + workspace (FK obligent) -----------------------
say
say "== seed org/projet =="
k exec "$API_POD" -- node -e '
const { Client } = require("pg");
const [org, orgPirate, proj] = process.argv.slice(1);
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const q = (s, p) => c.query(s, p);
  for (const o of [org, orgPirate]) {
    await q(`INSERT INTO "Organization" (id, name, slug, "createdAt", "updatedAt")
             VALUES ($1, $1, $1, now(), now()) ON CONFLICT (id) DO NOTHING`, [o]);
  }
  await q(`INSERT INTO "Project" (id, "organizationId", name, slug, "createdAt", "updatedAt")
           VALUES ($1, $2, $1, $1, now(), now()) ON CONFLICT (id) DO NOTHING`, [proj, org]);
  const r = await q(`SELECT id FROM "Organization" WHERE id = ANY($1)`, [[org, orgPirate]]);
  console.log("orgs:", r.rows.map((x) => x.id).join(","));
  await c.end();
})().catch((e) => { console.error("SEED KO:", e.message); process.exit(1); });
' "$ORG_OK" "$ORG_PIRATE" "$PROJ" 2>&1 | tee -a "$OUT"

# --- 5. démarrer le workspace par le workspace-manager (chemin réel) -------
say
say "== demarrage du workspace $WS (pod gVisor) =="
AGENT_IMAGE="$(k get configmap vibecore-vibecore-platform-platform-env -o jsonpath='{.data.WORKSPACE_AGENT_IMAGE}')"
say "  image agent: $AGENT_IMAGE"
k exec "$API_POD" -- sh -lc "curl -sS -m 300 -o /tmp/start.json -w '%{http_code}' \
  -X POST '$WSM_SVC/workspaces/start' \
  -H \"authorization: Bearer \$WORKSPACE_MANAGER_SHARED_SECRET\" \
  -H 'content-type: application/json' \
  -d '{\"orgId\":\"$ORG_OK\",\"projectId\":\"$PROJ\",\"workspaceId\":\"$WS\",\"image\":\"$AGENT_IMAGE\"}'; \
  echo; head -c 300 /tmp/start.json" 2>&1 | tee -a "$OUT"

say
say "  attente du pod..."
audit_kubectl -n "$RUNTIME_NS" wait --for=condition=Ready "pod/$WS_POD" --timeout=300s 2>&1 | tee -a "$OUT"
audit_kubectl -n "$RUNTIME_NS" get pod "$WS_POD" -o wide 2>&1 | tail -2 | tee -a "$OUT"

# --- 6. un VRAI serveur de dev dans le pod : HTTP 5173, HTTP+WS 5174 -------
say
say "== serveur de dev dans le pod (5173 HTTP, 5174 HTTP+WebSocket) =="
audit_kubectl -n "$RUNTIME_NS" exec "$WS_POD" -- sh -lc 'cat > /tmp/srv.js <<"JS"
const http = require("node:http");
const crypto = require("node:crypto");
const page = "<!doctype html><html><head><meta charset=utf-8><title>porte</title></head><body><h1>PREUVE PORTE</h1><p>ws-porte</p></body></html>";
http.createServer((_q, r) => { r.setHeader("content-type", "text/html; charset=utf-8"); r.end(page); }).listen(5173, "0.0.0.0");
// 5174 : HTTP + upgrade WebSocket minimal (poignee de main RFC 6455, une trame texte).
const srv = http.createServer((_q, r) => r.end("ok"));
srv.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"] || "";
  const accept = crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
  const payload = Buffer.from("SECRET-DU-TENANT-A");
  socket.write(Buffer.concat([Buffer.from([0x81, payload.length]), payload]));
});
srv.listen(5174, "0.0.0.0");
JS
(setsid node /tmp/srv.js >/tmp/srv.log 2>&1 &) ; sleep 3
head -5 /tmp/srv.log' 2>&1 | tee -a "$OUT"

# Sonde des ports en NODE, pas en `/dev/tcp` : le shell du conteneur n'est pas
# bash, donc `/dev/tcp` y echoue TOUJOURS — il rapportait « FERME » sur un serveur
# qui tournait parfaitement (EADDRINUSE au relancement l'a prouve).
audit_kubectl -n "$RUNTIME_NS" exec "$WS_POD" -- node -e '
const net = require("node:net");
const check = (p) => new Promise((res) => {
  const s = net.connect(p, "127.0.0.1");
  s.on("connect", () => { s.destroy(); res(`  port ${p}: ouvert`); });
  s.on("error", (e) => res(`  port ${p}: FERME (${e.code})`));
  s.setTimeout(3000, () => { s.destroy(); res(`  port ${p}: TIMEOUT`); });
});
(async () => { for (const p of [5173, 5174]) console.log(await check(p)); })();
' 2>&1 | tee -a "$OUT"

# --- 7. forger les jetons DANS le cluster ---------------------------------
say
say "== jetons vc_preview forges dans le pod api (le secret ne sort pas) =="
TOKENS="$(k exec "$API_POD" -- node -e '
const { createHmac } = require("node:crypto");
const secret = process.env.PREVIEW_TENANT_SECRET;
if (!secret) { console.error("PREVIEW_TENANT_SECRET absent"); process.exit(1); }
const exp = Date.now() + 3600_000;
const mint = (org) => {
  const head = Buffer.from(org).toString("base64url") + "." + exp;
  return head + "." + createHmac("sha256", secret).update(head).digest("base64url");
};
console.log("LEGIT=" + mint(process.argv[1]));
console.log("PIRATE=" + mint(process.argv[2]));
console.log("BIDON=" + Buffer.from(process.argv[1]).toString("base64url") + "." + exp + ".signature-invalide");
' "$ORG_OK" "$ORG_PIRATE" 2>/dev/null)"
eval "$TOKENS"
say "  jeton legitime : ${LEGIT%%.*}.<exp>.<sig tronquee>"
say "  jeton intrus   : ${PIRATE%%.*}.<exp>.<sig tronquee>"

PREVIEW_SUFFIX="$(k get configmap vibecore-vibecore-platform-platform-env -o jsonpath='{.data.PREVIEW_DOMAIN}')"
say "  domaine preview: $PREVIEW_SUFFIX"

# `probe <libelle> <args curl…>` — statut + debut du corps, depuis l'interieur.
probe() {
  local label="$1"; shift
  local res
  res="$(k exec "$API_POD" -- sh -lc "curl -sS -m 30 -o /tmp/b -w '%{http_code}' $* ; echo -n '  '; head -c 78 /tmp/b | tr -d '\n'" 2>&1 | tail -1)"
  printf '  %-46s %s\n' "$label" "$res" | tee -a "$OUT"
}

say
say "== PORTE 1 — lien de preview DIRECT (forme HOTE + cookie) =="
probe "cookie LEGITIME"  "-H 'host: $WS-5173.$PREVIEW_SUFFIX' -H 'cookie: vc_preview=$LEGIT' '$PROXY_SVC/'"
probe "cookie INTRUS"    "-H 'host: $WS-5173.$PREVIEW_SUFFIX' -H 'cookie: vc_preview=$PIRATE' '$PROXY_SVC/'"
probe "cookie BIDON"     "-H 'host: $WS-5173.$PREVIEW_SUFFIX' -H 'cookie: vc_preview=$BIDON' '$PROXY_SVC/'"
probe "SANS cookie"      "-H 'host: $WS-5173.$PREVIEW_SUFFIX' '$PROXY_SVC/'"

say
say "== PORTE 2 — publications: le chemin interne /d/<id> n'est pas public =="
probe "sans en-tete interne"   "'$PROXY_SVC/d/clx9k2m4pzz/'"
probe "en-tete interne BIDON"  "-H 'x-vibecore-preview-internal: pas-le-bon' '$PROXY_SVC/d/clx9k2m4pzz/'"
probe "en-tete interne VALIDE" "-H \"x-vibecore-preview-internal: \$PREVIEW_PROXY_SHARED_SECRET\" '$PROXY_SVC/d/clx9k2m4pzz/'"

say
say "== PORTE 3 — screenshotter (forme CHEMIN + en-tete interne de tenant) =="
probe "jeton LEGITIME" "-H 'x-vibecore-preview-tenant: $LEGIT' '$PROXY_SVC/p/$WS/5173/'"
probe "jeton INTRUS"   "-H 'x-vibecore-preview-tenant: $PIRATE' '$PROXY_SVC/p/$WS/5173/'"
probe "jeton BIDON"    "-H 'x-vibecore-preview-tenant: $BIDON' '$PROXY_SVC/p/$WS/5173/'"
probe "SANS jeton"     "'$PROXY_SVC/p/$WS/5173/'"

say
say "== PORTE 4 — upgrade WebSocket (HMR) sur un port qui sert vraiment une socket =="
k exec "$API_POD" -- node -e '
const net = require("node:net");
const [host, ws, tokLegit, tokPirate, tokBidon, suffix] = process.argv.slice(1);
const attempt = (label, cookie) => new Promise((resolve) => {
  const s = net.connect(3020, host);
  let buf = "";
  const done = (verdict) => { try { s.destroy(); } catch {} resolve(`  ${label.padEnd(44)} ${verdict}`); };
  s.setTimeout(15000, () => done("TIMEOUT"));
  s.on("error", (e) => done("ERREUR " + e.code));
  s.on("connect", () => {
    s.write(
      `GET / HTTP/1.1\r\nHost: ${ws}-5174.${suffix}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
      `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n` +
      (cookie ? `Cookie: vc_preview=${cookie}\r\n` : "") + "\r\n",
    );
  });
  s.on("data", (d) => {
    buf += d.toString("latin1");
    const status = (buf.split("\r\n")[0] || "").trim();
    if (!buf.includes("101")) { if (buf.includes("\r\n\r\n")) done("REFUSE par le proxy: " + status); return; }
    // 101 : on regarde si des DONNEES applicatives suivent.
    const secret = buf.includes("SECRET-DU-TENANT-A");
    if (secret || buf.length > 400) done(secret ? "101 + DONNEES: SECRET-DU-TENANT-A" : "101 sans donnees");
  });
});
(async () => {
  console.log(await attempt("SANS cookie", ""));
  console.log(await attempt("cookie INTRUS", tokPirate));
  console.log(await attempt("cookie BIDON", tokBidon));
  console.log(await attempt("cookie LEGITIME", tokLegit));
})();
' vibecore-vibecore-platform-preview-proxy."$NS".svc.cluster.local "$WS" "$LEGIT" "$PIRATE" "$BIDON" "$PREVIEW_SUFFIX" 2>&1 | tee -a "$OUT"

say
say "############ FIN — journal complet: $OUT ############"
