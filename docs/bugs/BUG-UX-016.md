---
id: BUG-UX-016
---

## Bug

**P3 (a11y) — `/workspace-settings` n'avait AUCUN titre de niveau 1.** La route monte la coque avec `hideHeader`, donc rien d'autre ne fournit de `h1`, et le composant démarrait son plan de titres au niveau 2. Ses pages sœurs (`/account-settings`, `/desktop-settings`) en fournissent bien un : la route était seule à laisser le document sans titre. Constaté sur les **3 formats**.

## 📤 Dispatché

✅

## 💻 Codé

✅

## ✅ Testé live

✅ 19/08

## Preuve

**Constaté live 17/08** — env d'audit `1c68880b39`, balayage de 32 routes user-area × 3 formats : `/workspace-settings` sans `h1` en desktop 1440, tablette 768 ET mobile 390 (`/account-settings` et `/desktop-settings` en ont un dans le même passage). **Correctif** : `app/components/settings/WorkspaceSettings.tsx` — le titre de page passe de `<h2>` à `<h1>`, **classes et taille visuelle inchangées** ; le composant n'est monté que par cette route (vérifié), donc aucun autre plan de titres n'est affecté. **Preuve rouge→vert réelle** : avec le test et SANS le correctif → **2 échecs** (`gives the page a level-1 heading, and only one` + l'assertion de niveau ajoutée au test FR existant) ; avec le correctif → **4/4 verts**. Lint et typecheck verts. **Certifié live 19/08** sur l'env de test redéployé (`web:de86d02bce`), aux **3 formats** : `h1`=1, premier niveau=1, enchaînement h1→h2 **sans saut**. ⚠️ Le premier correctif (`92ef0e1d`) créait un saut h1→h3 — vu seulement en remesurant après déploiement, corrigé par `42bb8080`.

