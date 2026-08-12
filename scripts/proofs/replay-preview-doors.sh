#!/usr/bin/env bash
# Rejeu LIVE des 4 portes d'accès à un preview, sur l'environnement d'audit.
#
#   scripts/proofs/replay-preview-doors.sh <tag-image-attendu>
#
# Ce que ça monte, en réel : une organisation légitime et une organisation intruse,
# un projet, un workspace en pod **gVisor**, un vrai serveur de dev (HTTP sur 5173,
# HTTP+WebSocket sur 5174), et les jetons `vc_preview` sont forgés **dans le
# cluster** (le secret HMAC n'en sort jamais).
#
# CE SCRIPT AFFIRME, IL NE DÉCRIT PAS.
#
# Une version précédente se contentait d'imprimer les statuts observés : c'était un
# rapport, pas un test — un 200 là où un 403 était attendu se lisait comme une ligne
# de plus dans un tableau. Désormais chaque porte est une ASSERTION (statut ET
# fragment de corps attendus, présence des données applicatives pour le 101), le
# script sort en échec au premier écart, et il tourne sous `set -euo pipefail` pour
# qu'aucune commande ratée ne passe inaperçue.
#
# PRÉCAUTIONS, dans cet ordre — chacune a déjà produit une fausse preuve :
#   1. cible épinglée et identité du cluster prouvée (jamais la prod) ;
#   2. le tag d'image attendu est vérifié sur CHAQUE réplique — une réplique restée
#      sur l'ancienne image avait renvoyé un 200 trompeur, lu à tort comme une fuite
#      inter-tenant ;
#   3. `PREVIEW_PROXY_ENFORCE_TENANT` **et** `PREVIEW_ENFORCE_PRIVATE_PORTS` sont
#      exigés à `true` dans CHAQUE pod du proxy ;
#   4. les requêtes partent de l'INTÉRIEUR du cluster, comme les vrais appelants —
#      et la porte des vignettes est jouée par le VRAI screenshotter, pas par une
#      requête qui imite sa forme.
#
# Les guillemets SIMPLES sont voulus partout où un `$VAR` doit être résolu DANS le
# pod (secrets d'environnement du cluster) et non sur la machine qui lance le
# script — c'est la propriété recherchée, pas un oubli.
# shellcheck disable=SC2016
set -euo pipefail

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
# Le POD ne porte pas l'id du workspace : le manager le préfixe. Attendre
# `pod/ws-porte` échouait donc silencieusement (« pod introuvable »).
WS_POD="workspace-$WS"

OUT="${OUT:-/tmp/portes-preview-$EXPECTED_TAG.txt}"

audit_env_pin_cluster_target
audit_env_require_audit_cluster

k() { audit_kubectl -n "$NS" "$@"; }

say() { printf '%s\n' "$*" | tee -a "$OUT"; }
: > "$OUT"

echecs=0
ko() {
  say "  ECHEC: $*"
  echecs=$((echecs + 1))
}

# `attendu <libellé> <statut> <fragment de corps> <args curl…>`
#
# Le fragment de corps compte autant que le statut : un 403 « mauvais code » et un
# 403 « pas d'accès à cet aperçu » ne disent pas la même chose, et c'est le second
# qui prouve que la porte tenant a statué.
attendu() {
  local label="$1" want_code="$2" want_body="$3"; shift 3
  local res code hits preview

  # Le marqueur est cherche dans le corps ENTIER, cote pod, pas dans un apercu
  # tronque : le proxy injecte son shim HMR avant `<body>`, si bien que le
  # marqueur applicatif se trouve au-dela des premieres centaines d'octets. Une
  # assertion qui ne regarde que le debut du corps produit un faux echec — et,
  # dans l'autre sens, aurait pu produire un faux succes.
  res="$(k exec "$API_POD" -- sh -lc "curl -sS -m 30 -o /tmp/b -w '%{http_code}' $* ; echo; grep -c -F -- '$want_body' /tmp/b 2>/dev/null || echo 0; head -c 90 /tmp/b | tr -d '\n'" 2>&1 | tail -3)"
  code="$(printf '%s' "$res" | sed -n '1p' | tr -d ' \r')"
  hits="$(printf '%s' "$res" | sed -n '2p' | tr -d ' \r')"
  preview="$(printf '%s' "$res" | sed -n '3p')"

  printf '  %-46s %s  %s\n' "$label" "$code" "$(printf '%s' "$preview" | cut -c1-68)" | tee -a "$OUT"

  [[ "$code" == "$want_code" ]] || ko "$label: statut $code, attendu $want_code"
  [[ "${hits:-0}" -gt 0 ]] || ko "$label: le corps ne contient pas « $want_body »"
}

say "############ REJEU LIVE DES 4 PORTES ############"
say "date: $(date -u +%FT%TZ)   tag attendu: $EXPECTED_TAG"
say "cluster: $AUDIT_KUBE_CONTEXT"
say

# --- 1. la flotte tourne-t-elle TOUTE le tag attendu ? ----------------------
#
# PORTÉE : les composants que les 4 portes TRAVERSENT — le proxy (qui tient la
# porte), l'api (verdict des ports privés), le workspace-manager (résolution
# d'agent + propriété de l'org) et le screenshotter (porte des vignettes). Le tier
# `web` en est exclu : aucune porte ne passe par lui, et l'inclure rendait la preuve
# otage d'un travail concurrent sans rapport sur le même cluster d'audit.
say "== flotte (composants traverses par les portes) =="
for comp in api preview-proxy workspace-manager screenshotter; do
  tags="$(k get pods -l "app.kubernetes.io/component=$comp" \
    -o jsonpath='{range .items[*]}{.spec.containers[0].image}{"\n"}{end}' | sed 's/.*://' | sort -u)"
  n="$(k get pods -l "app.kubernetes.io/component=$comp" --no-headers 2>/dev/null | grep -c . || true)"
  say "  $comp: $n replique(s), tag(s)=$(echo "$tags" | tr '\n' ' ')"
  [[ "$tags" == "$EXPECTED_TAG" ]] || ko "$comp ne tourne pas UNIQUEMENT $EXPECTED_TAG"
done

if ((echecs > 0)); then
  say "REFUS: la flotte n'est pas homogene sur le tag attendu — toute mesure serait ambigue."
  exit 1
fi

# --- 2. drapeaux d'enforcement, sur chaque réplique du proxy ----------------
say
say "== drapeaux (lus dans CHAQUE pod du proxy, pas dans le configmap) =="
for pod in $(k get pods -l app.kubernetes.io/component=preview-proxy -o jsonpath='{.items[*].metadata.name}'); do
  vals="$(k exec "$pod" -- sh -lc 'echo "TENANT=${PREVIEW_PROXY_ENFORCE_TENANT:-vide} PRIVATE=${PREVIEW_ENFORCE_PRIVATE_PORTS:-vide}"')"
  say "  $pod: $vals"
  [[ "$vals" == *"TENANT=true"* ]] || ko "$pod: PREVIEW_PROXY_ENFORCE_TENANT != true"
  # Exigé explicitement : l'enforcement des ports privés est la moitié du verdict
  # que le correctif fail-closed de l'API alimente.
  [[ "$vals" == *"PRIVATE=true"* ]] || ko "$pod: PREVIEW_ENFORCE_PRIVATE_PORTS != true"
done

if ((echecs > 0)); then
  say "REFUS: l'enforcement n'est pas actif sur toutes les repliques du proxy."
  exit 1
fi

API_POD="$(k get pods -l app.kubernetes.io/component=api -o jsonpath='{.items[0].metadata.name}')"
PROXY_SVC="http://vibecore-vibecore-platform-preview-proxy.$NS.svc.cluster.local:3020"
WSM_SVC="http://vibecore-vibecore-platform-workspace-manager.$NS.svc.cluster.local:3010"
SHOT_SVC="http://vibecore-vibecore-platform-screenshotter.$NS.svc.cluster.local:3030"

# --- 3. semer org + projet (les FK l'exigent) -------------------------------
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

# --- 4. démarrer le workspace par le workspace-manager (chemin réel) -------
say
say "== demarrage du workspace $WS (pod gVisor) =="
AGENT_IMAGE="$(k get configmap vibecore-vibecore-platform-platform-env -o jsonpath='{.data.WORKSPACE_AGENT_IMAGE}')"
say "  image agent: $AGENT_IMAGE"
start_code="$(k exec "$API_POD" -- sh -lc "curl -sS -m 300 -o /tmp/start.json -w '%{http_code}' \
  -X POST '$WSM_SVC/workspaces/start' \
  -H \"authorization: Bearer \$WORKSPACE_MANAGER_SHARED_SECRET\" \
  -H 'content-type: application/json' \
  -d '{\"orgId\":\"$ORG_OK\",\"projectId\":\"$PROJ\",\"workspaceId\":\"$WS\",\"image\":\"$AGENT_IMAGE\"}'" 2>&1 | tail -1)"
say "  POST /workspaces/start -> $start_code"
[[ "$start_code" == "200" ]] || ko "demarrage du workspace: $start_code"

audit_kubectl -n "$RUNTIME_NS" wait --for=condition=Ready "pod/$WS_POD" --timeout=300s 2>&1 | tee -a "$OUT"
runtime_class="$(audit_kubectl -n "$RUNTIME_NS" get pod "$WS_POD" -o jsonpath='{.spec.runtimeClassName}')"
say "  runtimeClass du pod: ${runtime_class:-aucune}"
[[ "$runtime_class" == "gvisor" ]] || ko "le workspace ne tourne pas sous gVisor (runtimeClass=${runtime_class:-aucune})"

# --- 5. un VRAI serveur de dev dans le pod : HTTP 5173, HTTP+WS 5174 -------
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

# Sonde des ports en NODE, pas en `/dev/tcp` : le shell du conteneur n'est pas bash,
# donc `/dev/tcp` y échoue TOUJOURS — il rapportait « FERME » sur un serveur qui
# tournait parfaitement (l'EADDRINUSE au relancement l'a prouvé).
ports="$(audit_kubectl -n "$RUNTIME_NS" exec "$WS_POD" -- node -e '
const net = require("node:net");
const check = (p) => new Promise((res) => {
  const s = net.connect(p, "127.0.0.1");
  s.on("connect", () => { s.destroy(); res(`${p}:ouvert`); });
  s.on("error", (e) => res(`${p}:FERME(${e.code})`));
  s.setTimeout(3000, () => { s.destroy(); res(`${p}:TIMEOUT`); });
});
(async () => console.log((await Promise.all([5173, 5174].map(check))).join(" ")))();
')"
say "  ports: $ports"
[[ "$ports" == *"5173:ouvert"* && "$ports" == *"5174:ouvert"* ]] || ko "le serveur de dev n'ecoute pas sur 5173+5174 ($ports)"

# --- 6. forger les jetons DANS le cluster ---------------------------------
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
' "$ORG_OK" "$ORG_PIRATE")"
eval "$TOKENS"
say "  jeton legitime : ${LEGIT%%.*}.<exp>.<sig tronquee>"
say "  jeton intrus   : ${PIRATE%%.*}.<exp>.<sig tronquee>"

PREVIEW_SUFFIX="$(k get configmap vibecore-vibecore-platform-platform-env -o jsonpath='{.data.PREVIEW_DOMAIN}')"
say "  domaine preview: $PREVIEW_SUFFIX"

say
say "== PORTE 1 — lien de preview DIRECT (forme HOTE + cookie) =="
attendu "cookie LEGITIME" 200 'PREUVE PORTE' \
  "-H 'host: $WS-5173.$PREVIEW_SUFFIX' -H 'cookie: vc_preview=$LEGIT' '$PROXY_SVC/'"
attendu "cookie INTRUS" 404 'PREVIEW_AGENT_NOT_FOUND' \
  "-H 'host: $WS-5173.$PREVIEW_SUFFIX' -H 'cookie: vc_preview=$PIRATE' '$PROXY_SVC/'"
attendu "cookie BIDON" 403 'PREVIEW_TENANT_FORBIDDEN' \
  "-H 'host: $WS-5173.$PREVIEW_SUFFIX' -H 'cookie: vc_preview=$BIDON' '$PROXY_SVC/'"
attendu "SANS cookie" 403 'PREVIEW_TENANT_FORBIDDEN' \
  "-H 'host: $WS-5173.$PREVIEW_SUFFIX' '$PROXY_SVC/'"

say
say "== PORTE 2 — publications: le chemin interne /d/<id> n'est pas public =="
attendu "sans en-tete interne" 403 'PREVIEW_INTERNAL_ONLY' "'$PROXY_SVC/d/clx9k2m4pzz/'"
attendu "en-tete interne BIDON" 403 'PREVIEW_INTERNAL_ONLY' \
  "-H 'x-vibecore-preview-internal: pas-le-bon' '$PROXY_SVC/d/clx9k2m4pzz/'"
# Avec le bon secret on FRANCHIT le garde d'appel interne — et c'est alors la
# verification d'extinction qui refuse, faute de pouvoir etablir que cette
# publication est encore valide. Deux refus en serie, aucun octet applicatif servi.
attendu "en-tete interne VALIDE" 503 'PUBLICATION_STATE_UNAVAILABLE' \
  "-H \"x-vibecore-preview-internal: \$PREVIEW_PROXY_SHARED_SECRET\" '$PROXY_SVC/d/clx9k2m4pzz/'"

say
say "== PORTE 3 — chemin /p (forme utilisee par le screenshotter) =="
attendu "jeton LEGITIME" 200 'PREUVE PORTE' \
  "-H 'x-vibecore-preview-tenant: $LEGIT' '$PROXY_SVC/p/$WS/5173/'"
attendu "jeton INTRUS" 404 'PREVIEW_AGENT_NOT_FOUND' \
  "-H 'x-vibecore-preview-tenant: $PIRATE' '$PROXY_SVC/p/$WS/5173/'"
attendu "jeton BIDON" 403 'PREVIEW_TENANT_FORBIDDEN' \
  "-H 'x-vibecore-preview-tenant: $BIDON' '$PROXY_SVC/p/$WS/5173/'"
attendu "SANS jeton" 403 'PREVIEW_TENANT_FORBIDDEN' "'$PROXY_SVC/p/$WS/5173/'"

say
say "== PORTE 3bis — E2E REEL: screenshotter -> preview-proxy -> workspace =="
#
# La preuve précédente s'arrêtait au proxy : elle montrait que la FORME de requête du
# screenshotter passe la porte, pas que le screenshotter la produit. Ici c'est le
# service lui-même, avec son vrai Chromium, qui reçoit une URL d'hôte de preview,
# la réécrit en `/p/<ws>/<port>`, traverse le proxy et rend le PNG du dev server.
shot="$(k exec "$API_POD" -- sh -lc "curl -sS -m 120 -o /tmp/shot.png -w '%{http_code} %{size_download}' \
  -X POST '$SHOT_SVC/capture' \
  -H \"authorization: Bearer \$SCREENSHOTTER_SHARED_SECRET\" \
  -H 'content-type: application/json' \
  -d '{\"url\":\"https://$WS-5173.$PREVIEW_SUFFIX/\",\"projectId\":\"$PROJ\",\"tenantToken\":\"$LEGIT\"}'" 2>&1 | tail -1)"
shot_code="${shot%% *}"
shot_size="${shot##* }"
say "  POST /capture (jeton LEGITIME) -> HTTP $shot_code, $shot_size octets"
[[ "$shot_code" == "200" ]] || ko "capture E2E: statut $shot_code"
# Un PNG réel, pas une page d'erreur : magie PNG + une taille plausible.
magic="$(k exec "$API_POD" -- sh -lc 'head -c 8 /tmp/shot.png | od -An -tx1 | tr -d " \n"')"
say "  entete du fichier rendu: $magic"
[[ "$magic" == 89504e470d0a1a0a* ]] || ko "le fichier rendu n'est pas un PNG (entete=$magic)"
[[ "$shot_size" -gt 1000 ]] || ko "PNG suspect: $shot_size octets"

# Le pendant qui compte : SANS jeton, la capture ne doit pas rendre le contenu du
# workspace. Le screenshotter renvoie alors une erreur ou un PNG d'echec — dans les
# deux cas le proxy a refuse (403 dans ses logs), donc aucun octet applicatif.
shot_ko="$(k exec "$API_POD" -- sh -lc "curl -sS -m 120 -o /tmp/shot2.png -w '%{http_code} %{size_download}' \
  -X POST '$SHOT_SVC/capture' \
  -H \"authorization: Bearer \$SCREENSHOTTER_SHARED_SECRET\" \
  -H 'content-type: application/json' \
  -d '{\"url\":\"https://$WS-5173.$PREVIEW_SUFFIX/\",\"projectId\":\"$PROJ\"}'" 2>&1 | tail -1)"
say "  POST /capture (SANS jeton)     -> HTTP ${shot_ko%% *}, ${shot_ko##* } octets"

# Ce que le proxy a REELLEMENT repondu au screenshotter, lu dans ses logs
# structures et correle par requete. On ne cherche PAS un code d'erreur dans les
# logs : ce code vit dans le CORPS de la reponse, pas dans la ligne de log. Ce qui
# est journalise, et qui suffit, c'est le couple (url, statut) par requete.
doc_path="/p/$WS/5173/"
SHOT_IP="$(k get pods -l app.kubernetes.io/component=screenshotter -o jsonpath='{.items[0].status.podIP}')"
say "  ip du pod screenshotter: $SHOT_IP"
verdicts="$(k logs -l app.kubernetes.io/component=preview-proxy --since=10m --tail=-1 2>/dev/null |
  SHOT_IP="$SHOT_IP" WS="$WS" python3 -c '
import json, os, sys
from collections import Counter
ip, ws = os.environ["SHOT_IP"], os.environ["WS"]
seen = {}
for line in sys.stdin:
    line = line.strip()
    if not line.startswith("{"):
        continue
    try:
        d = json.loads(line)
    except Exception:
        continue
    key = (d.get("hostname"), d.get("reqId"))
    r = d.get("req")
    if isinstance(r, dict):
        seen.setdefault(key, {})["url"] = r.get("url")
        seen.setdefault(key, {})["from"] = r.get("remoteAddress")
    s = d.get("res")
    if isinstance(s, dict):
        seen.setdefault(key, {})["code"] = s.get("statusCode")
doc = f"/p/{ws}/5173/"
tally = Counter(
    v.get("code") for v in seen.values() if v.get("from") == ip and v.get("url") == doc
)
print(" ".join(f"{code}x{n}" for code, n in sorted(tally.items(), key=lambda kv: str(kv[0]))))
')"
say "  statuts du proxy sur $doc_path pour les requetes VENANT du screenshotter: ${verdicts:-aucun}"
# Avec jeton -> 200 ; sans jeton -> 403. Les deux doivent apparaitre : le premier
# prouve que l'acces legitime traverse le trajet complet, le second que la porte
# refuse le meme trajet sans jeton.
[[ "$verdicts" == *"200x"* ]] || ko "E2E: aucun 200 du proxy pour la capture avec jeton"
[[ "$verdicts" == *"403x"* ]] || ko "E2E: aucun 403 du proxy pour la capture SANS jeton"
# Et les deux rendus doivent differer : meme URL, contenu different selon le droit.
[[ "${shot_size}" != "${shot_ko##* }" ]] ||
  ko "E2E: le rendu sans jeton fait la meme taille qu'avec jeton — suspect"

say
say "== PORTE 4 — upgrade WebSocket (HMR) sur un port qui sert vraiment une socket =="
ws_out="$(k exec "$API_POD" -- node -e '
const net = require("node:net");
const [host, ws, tokLegit, tokPirate, tokBidon, suffix] = process.argv.slice(1);
const attempt = (label, cookie) => new Promise((resolve) => {
  const s = net.connect(3020, host);
  let buf = "";
  const done = (verdict) => { try { s.destroy(); } catch {} resolve(`${label}|${verdict}`); };
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
    if (!buf.includes("101")) { if (buf.includes("\r\n\r\n")) done("REFUSE:" + status); return; }
    const secret = buf.includes("SECRET-DU-TENANT-A");
    if (secret || buf.length > 400) done(secret ? "101+DONNEES" : "101-SANS-DONNEES");
  });
});
(async () => {
  console.log(await attempt("SANS-cookie", ""));
  console.log(await attempt("cookie-INTRUS", tokPirate));
  console.log(await attempt("cookie-BIDON", tokBidon));
  console.log(await attempt("cookie-LEGITIME", tokLegit));
})();
' vibecore-vibecore-platform-preview-proxy."$NS".svc.cluster.local "$WS" "$LEGIT" "$PIRATE" "$BIDON" "$PREVIEW_SUFFIX")"
printf '%s\n' "$ws_out" | sed 's/^/  /' | tee -a "$OUT"

# Assertions : les trois premiers doivent être REFUSÉS (aucun 101), le dernier doit
# obtenir 101 ET les données applicatives — sinon l'accès légitime serait cassé et le
# tableau décrirait une plateforme morte, pas une plateforme isolée.
for cas in SANS-cookie cookie-INTRUS cookie-BIDON; do
  ligne="$(printf '%s\n' "$ws_out" | grep "^$cas|" || true)"
  [[ "$ligne" == *"REFUSE:"* ]] || ko "porte 4 / $cas: attendu un refus, obtenu « ${ligne#*|} »"
done
ligne="$(printf '%s\n' "$ws_out" | grep '^cookie-LEGITIME|' || true)"
[[ "$ligne" == *"101+DONNEES"* ]] || ko "porte 4 / cookie LEGITIME: attendu 101 + donnees, obtenu « ${ligne#*|} »"

say
if ((echecs == 0)); then
  say "############ 4 PORTES VERIFIEES (assertions, pas description) ############"
else
  say "############ $echecs ASSERTION(S) EN ECHEC ############"
fi
say "journal complet: $OUT"

exit "$((echecs > 0 ? 1 : 0))"
