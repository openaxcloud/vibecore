---
id: BUG-PREVIEW-BLANK-002
---

## Bug

**VRAI launch-blocker « Webview blanc » — course de disponibilité 404→200** (diagnostic Avi, confirmé). `/ports` annonce `ready:true` alors que le hostname public d'aperçu répond **HTTP 404 avec un corps de 0 octet** pendant ≤ ~182 s, puis la MÊME URL passe 200 + app complète. **Cause racine CONFIRMÉE par repro** : un dev server Vite ouvre son port (→ `/ports ready` = socket LISTEN, pas de GET HTTP) **AVANT** que `index.html` ne soit synchronisé sur le disque ; pendant cette fenêtre `GET /` de Vite renvoie **404 0 octet, content-type vide** (repro exacte : `curl` → `code=404 bytes=0 type=`), et l'agent (`app.ts:1026 reply.code(response.status).send()`) puis le preview-proxy relaient ce 404 vide **verbatim** → écran blanc silencieux (la page « Starting » n'était servie que sur erreur de connexion, jamais sur un vrai 404). Anomalies secondaires confirmées : (a) `GET /api/runtime/workspaces/:id/preview/:port` renvoyait `ready:true` **en dur** sans sonde ; (b) le child dev-server héritait `PORT=8080` = **port de contrôle de l'agent** (image `ENV PORT=8080`) → un framework honorant `PORT` crash-loop EADDRINUSE.

## 📤 Dispatché

✅ 05/08

## 💻 Codé

✅ mergé `4d913793` (PR #104, branche `fix/preview-readiness-race`) — **correction de suivi 11/08** : la cellule annonçait « PAS sur main » alors que la branche est ancêtre de `origin/main`

## ✅ Testé live

⚠️ **Prouvé sur repro réelle live** (chaîne fidèle proxy→agent→Vite + navigateur), pas encore prod

## Preuve

**Fix 1 (jamais de blanc)** `services/preview-proxy/src/app.ts` : sur une navigation document (iframe/document), un upstream 404/502/503 au corps vide ou non-HTML est converti en page « Starting your app… » auto-rafraîchie (2 s) au lieu du 404 vide ; un vrai 404 HTML (avec corps) passe intact ; les sous-ressources (script/XHR) passent intactes. **Preuve live** : index.html retiré → `curl` proxy = **503 901 o « Starting your app… »** (Vite renvoyait 404 0 o), navigateur = **spinner « Starting »** (pas de blanc) ; index.html restauré → auto-refresh → **app rendue « Race-fix app rendered ✅ »**. Responsive web/mobile 375/tablette 768, 0 débordement. **Fix 2 (sémantique readiness)** `services/api/src/app.ts` : l'endpoint preview single-port sonde désormais via `probePortReady` (2xx/3xx + corps non vide) au lieu de `ready:true` en dur. **Fix 3 (PORT)** `services/workspace-agent/src/app.ts` `sanitizedChildEnv` : en env preview, le child n'hérite plus du port de contrôle de l'agent (8080) → repointé sur le port d'aperçu épinglé 5173 (single-source `PREVIEW_DEV_PORT`). Tests : proxy **76/76** (dont 5 nouveaux : 404 0 o→503, 503 vide→503, vrai 404 HTML→passe, sous-ressource→passe), agent **+3** (repoint PORT), typecheck proxy+agent verts.

