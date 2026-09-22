---
id: BUG-WORKER-001
---

## Bug

**P1 — quatre jobs internes du worker échouaient à CHAQUE déclenchement en production : plus aucun métrage, ni maintenance base.** `inactivity.gc`, `metering.objectStorage`, `metering.databaseStorage` et `database.maintenance` exigeaient `API_INTERNAL_URL` ou `API_URL` **sans repli**, or la prod ne définit ni l'une ni l'autre — elle fournit `SAAS_API_URL` et `API_BASE_URL`. **Défaut SILENCIEUX** : les CronJobs affichent `Complete` car ils ne font qu'empiler le job ; l'échec se produit côté worker et ne remonte nulle part. **Cause racine : DEUX résolutions d'URL divergentes dans le même service** — `deploy-jobs.ts` essayait quatre variables, `index.ts` seulement deux.

## 📤 Dispatché

📤 **Dispatché**

## 💻 Codé

💻 **Codé (branche `fix/worker-api-url-resolution`, SHA `0b643836c4`)**

## ✅ Testé live

☐ **À vérifier après déploiement**

## Preuve

**Mesuré en prod avant correctif** : logs du worker → `metering.databaseStorage` et `database.maintenance` en erreur « API_INTERNAL_URL (or API_URL) is required », 6 occurrences sur la seule durée de vie du pod (82 min). En base : **aucun** événement `storage.*` ni `database.*` ; seul `workspaces.active`, dernier il y a **25 670 min (~17,8 j)**. **196 workspaces** en `RUNNING`/`STARTING`/`PENDING` (123/63/10) pour **0 pod** réellement présent. **Joignabilité vérifiée EN RÉEL depuis le pod worker de prod avant de choisir l'ordre** : `SAAS_API_URL` et `API_BASE_URL` portent la MÊME valeur et répondent **HTTP 200** sur `/health` et `/ready` (6 à 273 ms). L'avertissement historique visant un `API_BASE_URL` sur `svc:80` est périmé — c'est `OBJECT_STORAGE_API_URL` qui porte ce port. Correctif : résolveur **unique** (`api-base-url.ts`) partagé par les deux fichiers, valeurs vides **filtrées explicitement** (`??` ne court-circuite que null/undefined, une variable vide issue d'un template Helm l'aurait emporté), et `API_INTERNAL_URL` ajoutée au configmap par défaut égale à `saasApiUrl`, émise seulement si non vide — ce qui **répare aussi l'environnement d'audit** sans toucher son fichier de values. Vérifs : `i18n:check` clean, build réel du worker propre, 42 tests verts, `helm lint` vert. ⚠️ La réconciliation des lignes fantômes passe par `reconcileOrphanedActiveWorkspaces` (à l'ouverture) et `inactivity.gc` : la résorption sera **progressive**, pas instantanée.

