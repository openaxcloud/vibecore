---
id: BUG-METHODE-MODULE-MORT-002
---

## Bug

**Suite de -001 : la ligne de base traitée, et le scanner corrigé de DEUX faux positifs.** Cinq jours après la mesure, les onze modules étaient toujours importés par leur seul spec. `git log -S` sur chacun : **dix créés dans un seul commit (#476, 06/09) et JAMAIS importés par du code produit depuis** — ni régression ni fonctionnalité perdue, du travail spéculatif. Avant de toucher quoi que ce soit, vérification hors `app/` : `apps/admin/src/i18n.ts` importe `~/lib/i18n/catalogs/admin` — **le catalogue admin était VIVANT**, le scanner ne lisait que `app/` comme source d'importateurs. Second faux positif en élargissant à `packages/` : un spec y important `./index` faisait apparaître trois barrels de `app/lib` comme morts (appariement par nom, `index` est trop commun).

## 📤 Dispatché

☑ 15/09

## 💻 Codé

☑ 15/09

## ✅ Testé live

☐

## Preuve

**Scanner** : importateurs lus sur `app/ apps/ services/ packages/ tests/ scripts/`, barrels exclus des cibles, deux gardes exemptées avec leur raison (`ide-panel-density`, `live-audit-heuristics` — outil de l'audit i18n E2E). **Supprimés (7 modules + 7 specs, chacun avec sa preuve)** : `useReleasableLatch` (son propre en-tête ordonnait sa suppression dès que le garde de #371 atterrirait — il est câblé dans `BaseChat`) ; `sitemap-routes` (sous-ensemble périmé de 17 entrées d'une route qui en porte 84) ; `import-action-error` (les deux routes d'import classent en ligne, plus finement) ; `provider-cache-support` (registre sans lecteur, la `CACHE_MATRIX` qu'il cite n'existe pas) ; `useMessageBlocks` (« Sprint 2 » jamais fait) ; `agent-auto-accept`, `agent-progress` (jamais appelés, `'calculating'` en dur). **Gardé** : `secrets-unifies` — demandé par Avi (#522), à câbler dans le panneau, ce qui exige l'écran. Typecheck vert après suppression (aucun import de type caché), i18n vert. + épinglé par `app/lib/modules-morts.spec.ts` (12 tests, dont le cas `apps/` et le cas barrel, ligne de base réduite à une entrée). **DÉPLOYÉ EN PRODUCTION** le 2026-09-15 par le run 1612 de `deploy-main.yml` — sur EXACTEMENT ce commit (`head_sha` = `662af799e`, aucun `merge-base` à faire). Seul le niveau web reconstruit (05:42→05:52, les suppressions ne touchent que `app/`), `Helm upgrade` 05:58:09→06:01:48, `Verify rollout` ✅, `Verify running imageIDs match the release manifest` ✅ 06:02:01→06:02:18 — les pods qui tournent portent l'image construite sans ces sept modules ; rollback resté `skipped`. ⚠️ Déployer n'est pas vérifier : la colonne ✅ reste ouverte tant que rien n'a été constaté à l'écran.

