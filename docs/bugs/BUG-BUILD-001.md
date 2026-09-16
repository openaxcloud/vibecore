---
id: BUG-BUILD-001
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug

**Le service `admin` est inconstructible depuis `main`.** `pnpm --filter "@vibecore/admin" build` échoue en `tsc` : `apps/admin/src/i18n.ts(1,58) TS2307: Cannot find module '~/lib/i18n/catalogs/admin'` et `(2,87) '~/lib/i18n/language'`. Ces chemins `~/` pointent vers le dossier `app/` de l'application Remix, que le contexte Docker du service admin ne copie pas (il ne copie que `packages` et `services`). Toute reconstruction de l'image `admin` depuis `main` échoue donc.

## 📤 Dispatché

✅ 12/08

## 💻 Codé

☑ **10/09 — vérifié fermé**

## ✅ Testé live

✅ **12/08** reproduit ; **10/09 chaîne relue de bout en bout**

## Preuve

Cloud Build `ff073279` sur la source `origin/main` `2c104f24b7` : `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL @vibecore/admin build`, exit 2. Contourné en épinglant `services.admin.imageTag` à l'image précédente. Recoupe la note « `admin`/`web` inconstructibles sur main » du contre-audit PR #125. Lot **SÛR** (build). **10/09 — LE POINT EST FERMÉ, et la chaîne a été relue en entier plutôt que déduite (règle 1).** Trois maillons, tous vérifiés sur l'arbre courant : (1) l'image admin est construite par `infra/docker/node-service.Dockerfile` avec le CONTEXTE `.` — `app/` y est donc, et le `~/` de `apps/admin/src/i18n.ts` résout ; (2) `infra/cloudbuild/admin-tier.yaml` existe et `deploy-main.yml` l'invoque vraiment (`--config=…/admin-tier.yaml`) ; (3) la détection de changements reconnaît `apps/admin/`. ⚠️ **Le vrai défaut n'était pas la constructibilité** : l'en-tête d'`admin-tier.yaml` le dit — le correctif Docker de 2026-08-18 était JUSTE et n'a rien changé, parce que personne ne construisait cette image ; l'admin de production a tourné **56 jours et 1 415 commits** en retard sans qu'aucun déploiement n'échoue. épinglé par `scripts/deploy-tiers-couvrent-tous-les-services.spec.mjs` (8 tests verts le 10/09), qui exécute le VRAI shell de l'étape de détection et refuse qu'un service du chart ait un étage `none` — la règle, pas l'occurrence. ⚠️ **Une vérification que je n'ai PAS pu faire** : ce clone est SUPERFICIEL (287 commits) et `d839c4f65` n'y est pas ; « commit introuvable » ne veut pas dire « commit absent de `main` » (règle 3).

