#!/bin/bash
# Banc iOS — zone de saisie sous le clavier + barre d'onglets (XCUITest, vrai toucher).
# Monte une copie LOCALE de l'app (PG/Redis sous OrbStack, API :3001, web :5173),
# crée le compte de TEST local (compte-test.exemple.env), mesure, puis ÉTEINT TOUT.
# Serveur web en mode développement (le build de production demande 8 Go de tas).
# Usage : APP=/chemin/du/depot tests/ios-sim/clavier.sh [UDID]
set -u
ICI="$(cd "$(dirname "$0")" && pwd)"
APP="${APP:?APP = racine du depot vibecore installe}"
U="${1:-$(xcrun simctl list devices -j | python3 -c "import json,sys; d=json.load(sys.stdin)['devices']; print(next(x['udid'] for v in d.values() for x in v if x['name']=='vc-banc-ios-390'))")}"
SORTIE="${SORTIE:-$ICI/../../test-results/ios-sim}"; mkdir -p "$SORTIE"
set -a; . "$ICI/compte-test.exemple.env"; set +a
export DATABASE_URL=postgresql://vibecore:vibecore@127.0.0.1:55432/vibecore REDIS_URL=redis://127.0.0.1:56379
export API_HOST=127.0.0.1 API_PORT=3001 API_BASE_URL=http://127.0.0.1:3001 SAAS_API_URL=http://127.0.0.1:3001 HUSKY=0
PIDS=""
eteindre() {
  echo "== extinction"
  for p in $PIDS; do pkill -P "$p" 2>/dev/null; kill "$p" 2>/dev/null; done
  for port in 5173 3001 8765; do lsof -nP -iTCP:$port -sTCP:LISTEN -t 2>/dev/null | xargs kill 2>/dev/null; done
  (cd "$APP" && docker compose -p vc-banc-ios --env-file /dev/null -f docker-compose.dev.yml down -v >/dev/null 2>&1)
  xcrun simctl shutdown "$U" >/dev/null 2>&1
  [ "$ORB_PRIS" = oui ] && "$ICI/orbstack-verrou.sh" rendre
}
ORB_PRIS=non
trap eteindre EXIT
# Verrou partagé : OrbStack ne se ferme que quand la DERNIÈRE session le rend.
# Porte d'entrée (Mac 8 Go) : Docker est tombé DEUX fois en plein passage avec 12,4 Go d'échange au départ (30/09).
# On attend : mémoire libre ≥ 35 %, échange < 11 000 Mo, aucun test lourd RÉEL ailleurs (on compte des binaires :
# un pgrep -f sur des mots se comptait lui-même via la ligne de commande de son shell).
for i in $(seq 1 120); do
  swap=$(sysctl -n vm.swapusage | awk '{gsub("M","",$6); print int($6)}')
  libre=$(memory_pressure | awk '/free percentage/ {gsub("%","",$5); print int($5)}')
  lourds=$(ps -axo command= | grep -E '^[^ ]*node [^ ]*(typescript/bin/tsc|vitest[^ ]*|playwright[^ ]*/cli\.js) |^[^ ]*xcodebuild (test|build)' | grep -vc grep)
  echo "porte : libre=${libre}% swap=${swap}Mo lourds=${lourds}"
  [ "$libre" -ge 35 ] && [ "$swap" -lt 11000 ] && [ "$lourds" = 0 ] && break
  [ "$i" = 120 ] && { echo "PORTE FERMÉE après 60 min"; exit 1; }
  sleep 30
done
"$ICI/orbstack-verrou.sh" prendre; RC_ORB=$?
[ "$RC_ORB" != 3 ] && ORB_PRIS=oui
[ "$RC_ORB" = 0 ] || { echo "ORBSTACK KO ($RC_ORB)"; exit 1; }
# Base NEUVE à chaque passage : un volume resté d'un passage interrompu rend l'inscription 409.
(cd "$APP" && docker compose -p vc-banc-ios --env-file /dev/null -f docker-compose.dev.yml down -v) >> "$SORTIE/bases.log" 2>&1
(cd "$APP" && POSTGRES_PORT=55432 REDIS_PORT=56379 docker compose -p vc-banc-ios --env-file /dev/null -f docker-compose.dev.yml up -d --wait --wait-timeout 180 postgres redis) > "$SORTIE/bases.log" 2>&1 || { echo "BASES KO (voir bases.log)"; tail -20 "$SORTIE/bases.log"; exit 1; }
(cd "$APP" && pnpm --filter @vibecore/database db:deploy && pnpm --filter @vibecore/database db:seed) > "$SORTIE/migration.log" 2>&1 || { echo "MIGRATION KO (voir migration.log)"; grep -iE "error|fail" "$SORTIE/migration.log" | head -20; exit 1; }
(cd "$APP" && exec pnpm --filter @vibecore/api dev) > "$SORTIE/api.log" 2>&1 & PIDS="$PIDS $!"
for i in $(seq 1 120); do curl -fsS -m 3 http://127.0.0.1:3001/health >/dev/null 2>&1 && break; sleep 1; done
# WEB=prod : sert le build ($APP/build, `pnpm run build`) — ~300 Mo au lieu des ~3 Go du serveur de dev
# (esbuild + ré-optimisation Vite en plein passage), et plus d'« Application Error » au premier chargement.
if [ "${WEB:-dev}" = prod ]; then
  [ -f "$APP/build/server/index.js" ] || { echo "WEB=prod mais pas de build dans $APP/build"; exit 1; }
  # NODE_ENV=development au SERVICE (le bundle reste celui du build) : en production le cookie de session porte
  # `Secure` (app/lib/enterprise-api.server.ts:133) et Safari ne le renvoie pas sur http://127.0.0.1 — mesuré le 30/09.
  (cd "$APP" && HOST=127.0.0.1 PORT=5173 NODE_ENV=development exec pnpm run start:node) > "$SORTIE/web.log" 2>&1 & PIDS="$PIDS $!"
else
  (cd "$APP" && exec pnpm run dev:web --host 127.0.0.1 --port 5173) > "$SORTIE/web.log" 2>&1 & PIDS="$PIDS $!"
fi
for i in $(seq 1 300); do curl -fsS -m 10 -o /dev/null http://127.0.0.1:5173/ 2>/dev/null && break; sleep 1; done
curl -fsS -m 5 http://127.0.0.1:3001/health >/dev/null && curl -fsS -m 5 -o /dev/null http://127.0.0.1:5173/ || { echo "APP LOCALE KO"; grep -iE "error|fail" "$SORTIE/api.log" "$SORTIE/web.log" | head -20; exit 1; }
# Pas de `export X=$(…) ||` : export rend 0 et avale l'échec (projet vide mesuré le 30/09).
BANC_PROJET=$(python3 "$ICI/compte-test.py") && [ -n "$BANC_PROJET" ] || { echo "COMPTE DE TEST KO"; exit 1; }
export BANC_PROJET
echo "projet de test : $BANC_PROJET"
# Inventaire des champs de l'IDE (WebKit, police calculée) AVANT le simulateur : les deux ne tournent pas ensemble (8 Go).
if [ "${INVENTAIRE:-oui}" = oui ]; then
  APP="$APP" SORTIE="$SORTIE" BANC_PROJET="$BANC_PROJET" node "$ICI/champs-ide.mjs" > "$SORTIE/champs.log" 2>&1 || { echo "INVENTAIRE KO"; grep -iE "error|BANC-MESURE" "$SORTIE/champs.log" | tail -20; exit 1; }
  grep "BANC-MESURE" "$SORTIE/champs.log"
  export BANC_CHAMPS="$(cat "$SORTIE/champs.liste")"
fi
( cd "$ICI/page-zoom" && exec python3 -m http.server 8765 --bind 127.0.0.1 ) >/dev/null 2>&1 & PIDS="$PIDS $!"
xcrun simctl boot "$U" >/dev/null 2>&1
# APPARENCE=dark|light : thème système du simulateur (l'app suit le système si le compte est en « système »).
[ -n "${APPARENCE:-}" ] && xcrun simctl ui "$U" appearance "$APPARENCE"
rm -rf "$SORTIE/clavier.xcresult"
# TESTS : liste d'identifiants XCUITest séparés par des espaces (défaut : clavier + zoom dans l'app + témoin 12 px).
ONLY=""; for t in ${TESTS:-ClavierSafariTests ZoomSafariTests/test1_champ12pxFaitZoomer}; do ONLY="$ONLY -only-testing:BancUITests/$t"; done
etat() { echo "[$1] $(docker ps -a --filter name=vc-banc-ios --format '{{.Names}}={{.Status}}' | tr '\n' ' ') swap=$(sysctl -n vm.swapusage | awk '{print $6}')"; }
etat avant-test
# Les bases doivent être VIVANTES au départ du test : OrbStack est tombé plusieurs fois entre le montage et le test
# (01/10), et le passage continuait en produisant des captures d'écrans en erreur 503. Une base perdue = arrêt bruyant.
vivants=$(docker ps --filter name=vc-banc-ios --filter status=running -q 2>/dev/null | wc -l | tr -d ' ')
[ "$vivants" -ge 2 ] || { echo "BASES PERDUES avant le test (${vivants}/2 conteneurs) — OrbStack tombé ? Passage arrêté, rien n'est mesuré."; exit 1; }
TEST_RUNNER_BANC_IDE_BASE="$BANC_IDE_BASE" TEST_RUNNER_BANC_COURRIEL="$BANC_COURRIEL" TEST_RUNNER_BANC_SECRET="$BANC_SECRET" TEST_RUNNER_BANC_PROJET="$BANC_PROJET" TEST_RUNNER_BANC_CHAMPS="${BANC_CHAMPS:-}" TEST_RUNNER_BANC_URL=http://127.0.0.1:8765/index.html TEST_RUNNER_BANC_PANNEAUX="${BANC_PANNEAUX:-}" TEST_RUNNER_BANC_PARCOURS="${BANC_PARCOURS:-}" \
xcodebuild test -project "$ICI/xcuitest/BancIOS.xcodeproj" -scheme BancIOS $ONLY \
  -destination "platform=iOS Simulator,id=$U" -resultBundlePath "$SORTIE/clavier.xcresult" > "$SORTIE/clavier.log" 2>&1
RC=$?
etat apres-test
grep -E "BANC-MESURE|Test Case .*(passed|failed|skipped)|error:|\*\* TEST (SUCCEEDED|FAILED) \*\*" "$SORTIE/clavier.log"
exit $RC
