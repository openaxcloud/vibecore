---
id: BUG-DEPLOY-LIVE
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug

(mise à jour) **REPRODUIT — l'application déployée est BLANCHE.** Le déploiement statique aboutit normalement (`POST /projects/:id/deployments` → **202**, `QUEUED` → **READY en < 30 s**, URL émise), et l'URL sert bien son HTML en **200**. Mais cet HTML référence ses assets en `/static-deployments/<id>/assets/…`, qui répondent **404 `STATIC_DEPLOY_FILE_NOT_FOUND`**, alors que les mêmes assets existent en `/assets/…` (**200**). Le document se charge, tous ses assets échouent, `<div id="root">` reste vide. **Cause racine** : `snapshotStaticBuild()` (`services/api/src/deployments.ts`) réécrivait **inconditionnellement** les URL racine-absolues du `index.html` avec le préfixe `/static-deployments/<id>/`. Ce préfixe ne vaut que pour le mode **legacy servi par chemin** ; dès que `PREVIEW_DOMAIN` est défini — donc en **production** et pour tout déploiement réel — `deploymentPublicUrl()` renvoie une **origine dédiée** (`https://s-<id>.preview.<domaine>/`) où le snapshot est servi **à la racine**. Le chemin préfixé y est alors cherché comme un fichier *à l'intérieur* du snapshot et ne peut pas exister.

## 📤

✅ 12/08

## 💻

✅ branche `fix/deploy-static-base-path` `57234a22` (**non mergée**)

## ✅

✅ **12/08** défaut reproduit live

## Preuve

**Repro live** (env de test, jeton de session réel, projet `cmspnxpg9…`) : déploiement `cmspyoxst000l0na32v10bj3n`, `status=READY`, `url=https://s-cmspyoxst000l0na32v10bj3n.preview.34.163.208.161.sslip.io/`. Mesures : `GET /` → **200** (490 o, `<title>QA Panels Sweep</title>`) ; `GET /static-deployments/<id>/assets/index-CZ8Vosv_.js` → **404** `{"code":"STATIC_DEPLOY_FILE_NOT_FOUND"}` ; `GET /assets/index-CZ8Vosv_.js` → **200, 142 841 o**. En-têtes de l'hôte : `content-security-policy: sandbox … allow-same-origin` → on est bien sur l'origine dédiée. **Correctif** : ne réécrire que lorsqu'il n'y a **pas** d'origine dédiée. Le mode legacy n'est pas cassé — sa route redirige en **302** vers l'origine dédiée dès qu'il en existe une, donc le préfixe n'y sert jamais. **Tests** `services/api/src/static-deploy-base-path.spec.ts` **3/3**, rouge→vert vérifié (sans le correctif l'assertion « garde `/assets/…` » **échoue 1/3**, et le test du mode legacy reste vert des deux côtés) ; voisinage déploiement **31/31**. **LOT SENSIBLE (deploy) : PROUVÉ, NON MERGÉ** — pour l'expert.

