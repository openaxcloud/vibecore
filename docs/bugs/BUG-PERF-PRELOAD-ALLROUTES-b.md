---
id: BUG-PERF-PRELOAD-ALLROUTES
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug

(mise à jour — **cause racine trouvée, ce n'est pas un problème de routes**) Le chunk `root-*.js` — donc **toutes** les pages — importe **statiquement** `vendor-monaco-core` (573 Ko) et `vendor-terminal` (81 Ko). Deux accidents de bundling distincts, mesurés sur l'artefact de **prod** : **(1)** `root-*.js` contient `import{_ as qe}from"./vendor-monaco-core-*.js"` et n'utilise `qe` que dans `qe(async()=>{const{debugLogger:n}=await import("./debugLogger-*.js")})` — `qe` est **`__vitePreload`**, l'utilitaire de Vite. Il a atterri dans le chunk `vendor-monaco-core` (2,28 Mo bruts), or **tout** chunk faisant un `import()` dynamique importe cet utilitaire : la page d'accueil marketing traîne donc Monaco entier pour appeler une fonction de ~20 lignes. **(2)** `root-*.js` contient `import{c as gt}from"./vendor-terminal-*.js"` et n'utilise `gt` que dans `{rel:"stylesheet",href:gt}` — c'est l'**URL du CSS xterm** (`app/root.tsx` importe `@xterm/xterm/css/xterm.css?url`). La règle `manualChunks` `id.includes('/@xterm/')` matche aussi l'id du module d'**asset CSS**, qui se retrouve donc dans le chunk **JS** de 324 Ko.

## 📤

✅ 12/08

## 💻

☑ **moitié monaco/terminal, mesurée le 10/09**

## ✅

🟡

## Preuve

**Preuves brutes (prod, artefact déployé)** : le manifeste React Router embarqué dans le HTML donne `root.imports` = **96 entrées**, dont `/assets/vendor-monaco-core-*.js` ; le chunk `root-*.js` déployé liste bien 96 imports statiques, monaco et terminal compris. Écarté formellement : le graphe **source** de `app/root.tsx` (traceur statique + dynamique, paquets `@vibecore/*` résolus) atteint **248 modules et zéro import lourd** — la dépendance ne vient donc pas du code applicatif mais du découpage Rollup. Correctif préparé dans `vite.config.ts` : épingler `vite/preload-helper` sur son propre chunk, et ne jamais assigner les modules d'asset (`.css`, `?url`) aux chunks JS de paquet. **Gain attendu ≈ 654 Ko sur chaque page.** Lot **SÛR** (perf). **10/09 — LE GAIN EST CONFIRMÉ SUR L'ARTEFACT, ET LA MOITIÉ ROUTES NE L'EST PAS.** Les deux correctifs préparés sont bien en place dans `build-config/manual-chunks.ts` (`vite/preload-helper` épinglé, modules d'asset laissés hors des chunks JS). Mesuré sur un build local à `64fb6b51`, arbre propre : `root.imports` passe de **96 (prod 12/08) à 28**, et **AUCUN** chunk monaco / terminal / codemirror n'y figure ; les imports statiques de `root-*.js` tombent de 96 à **13**, aucun lourd. Témoin que la mesure porte sur la bonne chose (règle 4) : `vendor-monaco-core` pèse **2 283 041 octets**, les « 2,28 Mo » notés plus haut. ⚠️ **CE QUI RESTE, et je le chiffre plutôt que de le taire** : le chemin critique de la racine pèse encore **3 334 307 octets bruts sur 28 imports** — `runtime` 979 Ko, `vendor-react` 723 Ko (légitime), **`gitlabApiService` 485 Ko**, plus `mfa-setup`, `signup`, `account-settings._index`, `api.integrations.api-key._provider.configure`, `DebugTab`, `logs`. Des chunks de ROUTES sur la page d'accueil marketing : c'est le symptôme d'origine de ce point, jamais traité. Non corrigé ici — un découpage Rollup se casse en le bricolant (ce dépôt a déjà eu « Cannot access 'dt' before initialization » sur exactement ce terrain), et cela demande une vraie investigation. ⚠️ **ET LA GARDE EXISTANTE REGARDAIT À CÔTÉ** : `build-config/manual-chunks.spec.ts` teste la FONCTION de découpage, pas l'artefact. Rollup pourrait remonter monaco dans le chunk racine par un autre chemin et ses 4 tests resteraient verts pendant que les 654 Ko reviennent. épinglé désormais par `build-config/chemin-critique-racine.spec.ts` (lecture du manifeste + verdict, avec la forme EXACTE du défaut du 12/08 comme cas refusé) et par `scripts/verifier-chemin-critique.ts`, câblé dans `ci.yml` APRÈS « Build web » — il refuse un chunk d'éditeur ou de terminal sur le chemin critique ET une croissance silencieuse du total (cliquet 3 500 000, choisi pour laisser passer la mesure du jour et arrêter net un retour de monaco). Contre-épreuve sur le VRAI manifeste construit, code de sortie vérifié : monaco réinjecté dans `root.imports` → **1** ; un chunk de 1,69 Mo ajouté → **1** (5 028 507 > 3 500 000) ; restauré → **0**. ⚠️ Ma première contre-épreuve n'avait RIEN mesuré (28 imports et 3 334 307 octets identiques avant et après) : l'injection avait visé un autre `"imports":[` que celui de `root`. Refaite en ciblant l'entrée `root` — règle 14, un « ça ne rougit pas » n'informe que si la dégradation a bien eu lieu.

