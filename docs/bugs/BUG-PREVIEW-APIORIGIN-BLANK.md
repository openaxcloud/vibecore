---
id: BUG-PREVIEW-APIORIGIN-BLANK
---

## Bug

**PRIORITÉ — « Preview stayed empty / No visible preview status »** (agent Solutions) : Webview VIDE après refresh malgré runtime RUNNING, port 5173 prêt, **HTTP 200** (donc PAS le 404). **Cause racine** : il existe **2 chemins de service d'aperçu**. Shape A (`*.preview.e-code.ai`) passe par `services/preview-proxy` qui **injecte** le reporter (overlay #101 + watchdog blank + page « Starting »). Shape B = **fallback même-origine** `/api/runtime/workspaces/:id/preview/:port/proxy/` (utilisé quand `PREVIEW_URL_TEMPLATE`/`PREVIEW_PROXY_URL` est absent OU la chaîne littérale `"undefined"`/`"null"`), servi par `handleRuntimePreviewProxy` dans l'**api**, qui **streame le HTML brut SANS injection**. Sur Shape B : 200 sans reporter → aucun `PREVIEW_BLANK` → **ni app, ni overlay, ni statut** = blanc muet exact. (Confirmé : aucune string « official runtime URL recovery » dans le code — terme de l'agent ; `reloadPreview` re-pointe la même URL.)

## 📤 Dispatché

✅ 06/08

## 💻 Codé

✅ mergé `0dcc845e` (PR #117, branche `fix/preview-injection-runtime-resilience`) — **correction de suivi 11/08** : la cellule annonçait « PAS sur main » alors que la branche est ancêtre de `origin/main`

## ✅ Testé live

✅ **Prouvé en réel** (miroir fidèle du fallback api : même origine sert l'aperçu injecté ET le reporter)

## Preuve

**Fix** : (1) `services/api/src/app.ts handleRuntimePreviewProxy` bufferise le HTML text/html (≤2 Mo) et **injecte** `<script src="/vibecore-preview-reporter.js" data-vibecore-reporter>` (même origine que ce chemin api) avant `</head>` ; assets/streams inchangés (garantie OOM préservée). (2) `public/vibecore-preview-reporter.js` porté à parité (overlay + watchdog blank + détection prompte post-erreur). **Preuve écran** : app Vite qui **crashe au load** via le miroir fallback — **AVANT (sans inject)** = **blanc muet 200** ; **APRÈS (inject)** = **carte** « This preview failed to load » + `Uncaught Error: … (stale main.tsx)` + Reload. **Non-régression** : app saine → « Healthy app rendered ✅ », aucun overlay. Marker idempotent. `preview-reporter-format` 15/15 verts.

