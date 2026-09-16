---
id: BUG-DEVSERVER-DUAL-LAUNCHER
---

## Bug

**Correction STRUCTURELLE du P0 dev-server (sur #122)** : lever la cause de fond = **DEUX lanceurs**. (1) **Unifier** : le `start`-action (`<boltAction type="start">npm run dev</boltAction>`) ne lance PLUS le dev server dans le PTY jsh non-tracké — il **délègue** au lanceur unique tracké+install-aware (`startPreviewServer`→`streamCommand`) via un callback `onStartDevServer` câblé par le workbench ; il n'existe donc qu'**UN** lanceur suivi, reap-able, sans collision `--strictPort 5173`, sans process fantôme hors `/processes`. Un `start` **non-dev** (ex. `node worker.js`) reste sur le PTY (jamais silencieusement perdu). (2) **Boucle d'auto-retry** : `shouldRunPreviewBootLoop` ne s'arrête PLUS sur `previewRunFailed` (un 502 dev-absent, workspace sain) — elle **continue à relancer**, bornée par `MAX_PREVIEW_BOOT_ATTEMPTS=60` (~5 min), puis bascule sur l'UI manuelle ; bail immédiat conservé sur un vrai `workspaceError`. Acquis #122 (forceRestart, install fail-closed, statut honnête) **conservés**.

## 📤 Dispatché

✅ 06/08

## 💻 Codé

✅ mergé `f5cf3aa1` (PR #123, branche `fix/devserver-unify-launcher`) — **correction de suivi 11/08** : la cellule portait « PAS sur main » alors que la PR est mergée depuis le 07/08

## ✅ Testé live

⚠️ **Prouvé unitairement** ; bout-en-bout (génération→app live) **NON reproductible sandbox**

## Preuve

**Fixes** : `app/lib/runtime/action-runner.ts` (`onStartDevServer` + `isDevServerStartCommand` + délégation dans `#runStartAction`), `app/lib/stores/workbench.ts` (câble `() => startPreviewServer()`), `app/components/workbench/preview-frame-recovery.ts` (`shouldRunPreviewBootLoop` + `MAX_PREVIEW_BOOT_ATTEMPTS`), `Preview.tsx` (`bootAttemptsRef`, cap dans l'intervalle, reset au port trouvé). **Preuve** : **test délégation** — un `start` `npm run dev` appelle `onStartDevServer('npm run dev')` et **n'appelle JAMAIS `executeCommand`** (PTY) = un seul lanceur, zéro fantôme ; `start` non-dev → PTY préservé ; `isDevServerStartCommand` 13 dev→true / 6 non-dev→false ; `shouldRunPreviewBootLoop` — previewRunFailed+sain→**relance** (avant : stop), cap→stop, workspaceError→bail. **101 specs** verts (action-runner + preview-frame-recovery + workbench.reloaded incl. les 16 de #122). **NON prouvé live** : le fait qu'il ne reste bien qu'UN process dans `/processes` prod + aperçu 200 après génération = à valider post-déploiement (staging / IDs agent).

