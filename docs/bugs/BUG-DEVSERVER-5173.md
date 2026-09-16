---
id: BUG-DEVSERVER-5173
---

## Bug

**« Port 5173 is already in use » au démarrage du dev server** (agent Solutions). **HYPOTHÈSE #104 INFIRMÉE** : #104 repointait le child sur `PORT=5173`, mais **Vite IGNORE `PORT`** (repro : `PORT=5173 vite --port 5199` → bind 5199, pas 5173) donc pas de collision pour du Vite pur (tous les projets Solutions = `vite` pur). **Vraie cause** : un port 5173 déjà tenu (dev server orphelin après restart agent, marker non-matché, ou double-start auto-run+action) + `vite --strictPort` → crash « Port 5173 already in use » (reproduit à l'identique). `killStalePinnedDevServers` ne tuait que les process **suivis** par marker ; un tenant non-suivi restait.

## 📤 Dispatché

✅ 06/08

## 💻 Codé

✅ mergé `6184cb4f` (PR #108, branche `fix/preview-devserver-runtime`) — **correction de suivi 11/08** : la cellule annonçait « PAS sur main » alors que la branche est ancêtre de `origin/main`

## ✅ Testé live

✅ **Prouvé en réel (Vite réel)**

## Preuve

**Fix** `services/workspace-agent/src/app.ts` : (1) `sanitizedChildEnv` — en env preview, **SUPPRIME** le port de contrôle hérité (8080) au lieu de le repointer sur 5173 (n'oppose plus un helper honorant PORT à Vite) ; (2) `killStalePinnedDevServers` durci — tue les suivis PUIS **garantit le port libre** via un bind-probe autoritaire cross-plateforme (absorbe la fenêtre post-SIGKILL) et **tue l'orphelin non-suivi** trouvé via /proc, boucle bornée ~1,8 s ; (3) **lock de sérialisation par port** — deux starts concurrents ne peuvent plus binder 5173 simultanément (double-start → restart séquentiel propre). **Preuve live (Vite réel, port 52173)** : [1] prior ready → [2] 2ᵉ start naïf **CRASH « Port 52173 already in use »** (bug reproduit) → [3] après conflict-heal durci : prior tué, **restart READY ✅ bind propre**. Tests agent **74/74** (dont test process réel : holder tué + port rebindable ; sérialisation du lock ; ports indépendants ; PORT supprimé en preview) + typecheck vert.

