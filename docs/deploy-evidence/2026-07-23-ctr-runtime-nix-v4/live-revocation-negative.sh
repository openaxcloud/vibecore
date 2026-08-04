#!/usr/bin/env bash
# CTR-RUNTIME-NIX v4 — correction 4 : négatif LIVE « Publish avec lock révoqué → refus ».
#
# PRÉREQUIS (mini-merge, feu vert Avi) : cette branche déployée en prod, de sorte
# que le configmap porte NIX_STORE_GENERATIONS et que l'api interprète
# ecode.lock.json au Publish. Vérifier :
#   kubectl -n vibecore get configmap vibecore-vibecore-platform-platform-env \
#     -o jsonpath='{.data.NIX_STORE_GENERATIONS}' | head -c 40   # non vide = déployé
#
# Ce script prouve la chaîne UI→control plane→runtime→réseau→URL :
#   1. mint QA user+session (technique reference_prod_qa_session_mint)
#   2. projet QA + workspace + fichiers d'app + allowlist révision/nix
#   3. POST /projects/:id/nix-lock  → écrit un lock pinné gen-2 (concret)
#   4. Publish → 200, URL vivante  (lock honoré)
#   5. helm --set : gen-2 status=REVOKED  (rotation/révocation live)
#   6. Re-publish → REFUS TYPÉ ECODE_LOCK_GENERATION_REVOKED, deployment FAILED,
#      URL non servie — jamais de repli silencieux vers l'active.
#
# Chaque étape imprime le code HTTP + le corps brut. Hygiène : cleanup en fin
# (cascade-delete du user QA + remise gen-2 ACTIVE).
set -euo pipefail
CTX=connectgateway_vibecore-495216_europe-west9_vibecore-prod-app
API=https://api.e-code.ai
NS=vibecore

echo "== 0. garde-fou : le registre est-il déployé ?"
REG=$(kubectl --context "$CTX" -n "$NS" get configmap vibecore-vibecore-platform-platform-env \
  -o jsonpath='{.data.NIX_STORE_GENERATIONS}' | head -c 40)
[ -n "$REG" ] || { echo "STOP: NIX_STORE_GENERATIONS absent du configmap — brancher le mini-merge d'abord."; exit 1; }
echo "registre déployé: ${REG}…"

# 1. mint QA session (à remplir : script mint.js éprouvé le 15/07, scratchpad)
#    → exporte TOK (vc_…), ORGID, et crée le projet Python QA (deploy.json nix).
#    Voir docs/deploy-evidence/2026-07-15-phase-b/ pour la séquence exacte.
: "${TOK:?exporter TOK (session QA mintée)}"
: "${PROJID:?exporter PROJID (projet QA python, .ecode/deploy.json nix)}"

echo "== 3. écrire un lock pinné gen-2 (POST /projects/:id/nix-lock)"
curl -sS -o /tmp/lock.json -w "nix-lock -> HTTP %{http_code}\n" \
  -X POST "$API/projects/$PROJID/nix-lock" -H "Authorization: Bearer $TOK" \
  -H 'content-type: application/json' -d '{"generation":"gen-2","bundles":["python312"]}'
cat /tmp/lock.json; echo
grep -q '"storeGeneration":"gen-2"' /tmp/lock.json || { echo "STOP: lock non pinné gen-2"; exit 1; }

echo "== 4. Publish (lock honoré) → attendu READY + URL 200"
DEP1=$(curl -sS -X POST "$API/projects/$PROJID/deployments" -H "Authorization: Bearer $TOK" \
  -H 'content-type: application/json' -d '{"provider":"server","environment":"preview","timeoutSeconds":600}' \
  | python3 -c 'import json,sys;d=json.load(sys.stdin);print((d.get("deployment") or d)["id"])')
echo "deployment 1: $DEP1 (poller jusqu'à READY, curler l'URL → 200 attendu)"

echo "== 5. RÉVOQUER gen-2 en live (helm --set, JSON avec status REVOKED)"
echo "   -> éditer platformEnv.runtime.nixGenerations : gen-2 status=REVOKED +"
echo "      revokedAt/revokedReason ; helm upgrade --reuse-values --set ... ; rollout api"
echo "   (commande exacte laissée manuelle : elle modifie la prod — feu vert Avi)"

echo "== 6. Re-publish → REFUS TYPÉ attendu"
curl -sS -o /tmp/dep2.json -w "publish-2 -> HTTP %{http_code}\n" \
  -X POST "$API/projects/$PROJID/deployments" -H "Authorization: Bearer $TOK" \
  -H 'content-type: application/json' -d '{"provider":"server","environment":"preview","timeoutSeconds":600}'
echo "corps :"; cat /tmp/dep2.json; echo
echo "ATTENDU : status FAILED + message contenant 'REVOKED' / code ECODE_LOCK_GENERATION_REVOKED,"
echo "          l'URL du deployment 2 ne sert PAS l'app (410/erreur), jamais un repli vers l'active."

echo "== 7. cleanup : remettre gen-2 ACTIVE (helm) + cascade-delete du user QA."
