#!/bin/bash
# Revue UI bureau — copie LOCALE de l'app (PG/Redis sous OrbStack, API :3011, web :5191).
# Ports et projet Docker DISTINCTS du banc iOS (5173/3001/vc-banc-ios) : l'extinction
# de l'un ne tue jamais l'autre.
#
#   APP=/chemin/du/depot tests/ui-bureau/pile-locale.sh monter     # attend son tour, monte, crée le compte de test
#   APP=/chemin/du/depot tests/ui-bureau/pile-locale.sh descendre  # éteint TOUT et rend le verrou OrbStack
#
# Mac 8 Go partagé : porte d'entrée sur la mémoire d'échange, pas de départ en parallèle
# du banc iPhone, verrou partagé tests/ios-sim/orbstack-verrou.sh (compteur commun
# /tmp/orbstack-sessions.*), et extinction AUTOMATIQUE après UIB_DUREE_MAX_S (45 min).
set -u
ICI="$(cd "$(dirname "$0")" && pwd)"
APP="${APP:?APP = racine du depot vibecore installe}"
VERROU_ORB="${VERROU_ORB:-$APP/tests/ios-sim/orbstack-verrou.sh}"
[ -x "$VERROU_ORB" ] || VERROU_ORB="$HOME/dev/vibecore-banc-ios/tests/ios-sim/orbstack-verrou.sh"
[ -x "$VERROU_ORB" ] || { echo "verrou OrbStack introuvable ($VERROU_ORB)"; exit 1; }
ETAT=/tmp/ui-bureau-pile.etat
# Journaux HORS de test-results/, que Playwright vide à chaque passage.
SORTIE="${SORTIE:-${TMPDIR:-/tmp}/ui-bureau-journaux}"; mkdir -p "$SORTIE"
set -a; . "$ICI/compte-test.exemple.env"; set +a
export DATABASE_URL=postgresql://vibecore:vibecore@127.0.0.1:55442/vibecore REDIS_URL=redis://127.0.0.1:56389
export API_HOST=127.0.0.1 API_PORT=3011 API_BASE_URL=$UIB_API SAAS_API_URL=$UIB_API VITE_API_URL=$UIB_API
export VITE_RUNTIME_API_BASE_URL=$UIB_API/api/runtime API_CORS_ORIGINS=$UIB_WEB HUSKY=0
COMPOSE="docker compose -p vc-ui-bureau --env-file /dev/null -f docker-compose.dev.yml"

descendre() {
  echo "== extinction"
  for port in 5191 3011; do lsof -nP -iTCP:$port -sTCP:LISTEN -t 2>/dev/null | xargs kill 2>/dev/null; done
  [ -f "$ETAT" ] && for p in $(grep '^pid=' "$ETAT" | cut -d= -f2); do pkill -P "$p" 2>/dev/null; kill "$p" 2>/dev/null; done
  (cd "$APP" && $COMPOSE down -v >/dev/null 2>&1)
  if grep -q '^orb=oui' "$ETAT" 2>/dev/null; then "$VERROU_ORB" rendre; fi
  rm -f "$ETAT"
  echo "reste : $(lsof -nP -iTCP:5191 -iTCP:3011 -sTCP:LISTEN -t 2>/dev/null | wc -l | tr -d ' ') port(s), $(docker ps -q --filter name=vc-ui-bureau 2>/dev/null | wc -l | tr -d ' ') conteneur(s)"
}

case "${1:-}" in
  descendre) descendre; exit 0 ;;
  monter) ;;
  *) echo "usage : $0 monter|descendre" >&2; exit 2 ;;
esac

[ -f "$ETAT" ] && { echo "déjà montée ($ETAT) — descendre d'abord"; exit 1; }
# Porte : pas sous forte pression mémoire, et jamais pendant que le banc iPhone tourne.
for i in $(seq 1 "${UIB_ATTENTE_TOURS:-120}"); do
  swap=$(sysctl -n vm.swapusage | awk '{gsub("M","",$6); print int($6)}')
  banc=$(pgrep -f "ios-sim/clavier.sh|ios-sim/banc.mjs|xcodebuild test" | wc -l | tr -d ' ')
  sims=$(xcrun simctl list devices booted 2>/dev/null | grep -c Booted)
  lourds=$(pgrep -f "playwright test|vitest run|tsc --noEmit" | wc -l | tr -d ' ')
  echo "porte : swap=${swap}Mo banc=${banc} simulateurs=${sims} tests-lourds=${lourds}"
  [ "$swap" -lt "${SWAP_MAX_MO:-9500}" ] && [ "$banc" = 0 ] && [ "$sims" = 0 ] && [ "$lourds" = 0 ] && break
  [ "$i" = "${UIB_ATTENTE_TOURS:-120}" ] && { echo "PORTE FERMÉE — pas mon tour"; exit 1; }
  sleep 30
done

echo "orb=non" > "$ETAT"
"$VERROU_ORB" prendre; RC=$?
[ "$RC" != 3 ] && echo "orb=oui" > "$ETAT"
[ "$RC" = 0 ] || { echo "ORBSTACK KO ($RC)"; descendre; exit 1; }
(cd "$APP" && $COMPOSE down -v) > "$SORTIE/bases.log" 2>&1
(cd "$APP" && POSTGRES_PORT=55442 REDIS_PORT=56389 $COMPOSE up -d --wait --wait-timeout 180 postgres redis) >> "$SORTIE/bases.log" 2>&1 \
  || { echo "BASES KO"; tail -20 "$SORTIE/bases.log"; descendre; exit 1; }
(cd "$APP" && pnpm --filter @vibecore/database db:deploy && pnpm --filter @vibecore/database db:seed) > "$SORTIE/migration.log" 2>&1 \
  || { echo "MIGRATION KO"; grep -iE "error|fail" "$SORTIE/migration.log" | head -20; descendre; exit 1; }
(cd "$APP" && exec nice -n 5 pnpm --filter @vibecore/api dev) > "$SORTIE/api.log" 2>&1 & echo "pid=$!" >> "$ETAT"
for i in $(seq 1 180); do curl -fsS -m 3 "$UIB_API/health" >/dev/null 2>&1 && break; sleep 1; done
(cd "$APP" && exec nice -n 5 node_modules/.bin/react-router dev --host 127.0.0.1 --port 5191 --strictPort) > "$SORTIE/web.log" 2>&1 & echo "pid=$!" >> "$ETAT"
for i in $(seq 1 300); do curl -fsS -m 10 -o /dev/null "$UIB_WEB/login" 2>/dev/null && break; sleep 1; done
curl -fsS -m 5 "$UIB_API/health" >/dev/null && curl -fsS -m 30 -o /dev/null "$UIB_WEB/login" \
  || { echo "APP LOCALE KO"; grep -iE "error|fail" "$SORTIE/api.log" "$SORTIE/web.log" | head -20; descendre; exit 1; }
# Compte de TEST, sur 127.0.0.1 seulement.
python3 - <<'PY' > "$SORTIE/compte.log" 2>&1 || { echo "COMPTE DE TEST KO"; cat "$SORTIE/compte.log"; descendre; exit 1; }
import json, os, urllib.request, urllib.parse
api = os.environ['UIB_API']
assert urllib.parse.urlparse(api).hostname == '127.0.0.1', 'jamais ailleurs qu en local'
req = urllib.request.Request(api + '/auth/register', json.dumps({'email': os.environ['UIB_COURRIEL'], 'password': os.environ['UIB_SECRET'], 'name': 'Revue UI bureau', 'organizationName': 'Revue UI bureau'}).encode(), {'content-type': 'application/json'})
r = json.load(urllib.request.urlopen(req, timeout=60))
print('compte créé, organisation', r['organization']['id'])
PY
cat "$SORTIE/compte.log"
# Filet : extinction automatique même si la session oublie.
( sleep "${UIB_DUREE_MAX_S:-2700}"; APP="$APP" "$0" descendre ) > "$SORTIE/extinction-auto.log" 2>&1 &
echo "pid=$!" >> "$ETAT"
echo "PILE PRÊTE : $UIB_WEB (extinction automatique dans ${UIB_DUREE_MAX_S:-2700} s)"
