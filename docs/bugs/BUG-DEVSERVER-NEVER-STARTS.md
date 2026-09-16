---
id: BUG-DEVSERVER-NEVER-STARTS
---

## Bug

**P0 BLOQUE-LANCEMENT — le dev server ne démarre JAMAIS après génération** : workspace `RUNNING` mais `/processes = []`, aperçu **502 `preview_upstream_unreachable`** ~12 min, **clic « Run » = NO-OP**, et la barre annonce « Running on Port 5173 » (mensonger). **Cause racine (mappée, code)** : **DEUX lanceurs redondants qui collisionnent**. (A) l'IA émet `<boltAction type="start">npm run dev</boltAction>` → `action-runner #runStartAction` → `shell.executeCommand` → **PTY jsh** (`openTerminal`) que le handler `/terminal` de l'agent **n'enregistre PAS dans la Map processes** → invisible à `/processes`, install non garantie (Ctrl+C du prochain action tue l'install lente → `vite` absent → meurt). (B) client `startPreviewServer` → `streamCommand` → **tracké**. Les deux épinglent `--strictPort 5173` ; `stopPreviewServer` ne tue que les process **trackés** (via `/processes`) → **ne peut pas reaper le dev server PTY** ; le court-circuit « reattach existing » **adopte le port 5173 détecté-mais-mourant** → statut « running », aucun relaunch → **Run no-op** ; et la boucle d'auto-retry est **désactivée dès qu'un `workspaceError` (le 502) existe**. Le 5173 du PTY (via `/proc`, indépendant de la Map) → faux « Running on Port 5173 ».

## 📤 Dispatché

✅ 06/08

## 💻 Codé

✅ mergé `3bfcfc17` (PR #122, branche `fix/devserver-never-starts`) — **correction de suivi 11/08** : la cellule portait « PAS sur main » alors que la PR est mergée depuis le 07/08

## ✅ Testé live

⚠️ **Partiel** : fail-closed 127→error **prouvé unitairement (vrai store)** ; bout-en-bout (génération→app live) **NON reproductible en sandbox** (client+agent+pod complet requis)

## Preuve

**Fixes (`app/lib/stores/workbench.ts`)** : (1) **`forceRestart`** — un Run/Reinstall utilisateur **traverse** le garde d'un start wedgé (`#previewStarting`/`#previewStartPromise` jamais nettoyés si un await runtime pend) **ET** les court-circuits d'adoption → atteint `streamCommand`, où le conflict-heal #108 **libère 5173 de TOUT détenteur (y compris le PTY non-tracké)** puis bind un dev server frais **tracké** (→ visible dans `/processes`) ; (2) **install fail-CLOSED** — si la sonde « deps installées ? » échoue (502 provisioning), on **installe** au lieu de sauter (l'ancien `.catch(()=>true)` sautait → `vite: command not found` exit 127 → 502) ; (3) **statut honnête** — un dev command qui sort non-zéro (127) met l'état à **`error`** (« exit 127: command not found — dependencies not installed. Try Reinstall. »), plus de faux « running »/« idle ». **Preuve** : test store réel — dev exit 127 → `previewServerState='error'` (avant : idle/running) ; 16/16 specs `workbench.reloaded-actions` verts. **Follow-ups recommandés (validation staging)** : unifier les 2 lanceurs (le `start`-action PTY ne devrait pas lancer le dev server ; déléguer au chemin tracké) ; la boucle d'auto-retry ne devrait pas s'arrêter sur un 502 dev-server-absent (workspace sain). #108 (port) touche ce chemin (positivement, via forceRestart→streamCommand) ; #117 (dep-sync 404) aide l'install ; #119 (packages) non lié. **→ correction STRUCTURELLE dans PR #123 (`fix/devserver-unify-launcher`, stack sur #122).**

