---
id: BUG-DEPLOY-001
---

## Bug

**P0 — la chaîne de déploiement `main` → prod est bloquée : AUCUN déploiement réussi depuis `753b5ed38d` (run 1435, 03/09 23:40 UTC, révision Helm 1128).** Vingt-deux commits fusionnés le 04/09 (dont `fafed25`, `ebd7797`, `c28c6df`) ne sont pas en production. Trois mécanismes distincts, lus dans les journaux des runs : (a) **run 1436** (`11842966ba`, AVANT tout commit de cette session) — Helm upgrade réussi en 3 min 30, rollout vérifié, puis l'étape « Runtime probe — SEC-9 » sort en erreur **sans jamais afficher de code HTTP** : le `kubectl run sec9-probe-…` (pod curl jetable) n'a pas pu s'exécuter (RBAC / création de pod refusée, à confirmer), et `set -e` fait tomber l'étape → rollback vers 1128. Cette sonde tombera sur TOUT déploiement tant qu'elle ne peut pas créer son pod ; (b) **run 1453** (`c28c6df`) — portail de release vert (E2E 301/301), 3 tiers construits, scan et signatures OK, puis `helm upgrade --atomic --timeout 10m` : **`context deadline exceeded`**, rollback automatique. Différence avec 1436 : le lot porte la migration Prisma **0086_import_durable_staging** (#416), exécutée en hook `pre-upgrade` (`migrations-job.yaml`, `activeDeadlineSeconds: 600`) ; son `ALTER TABLE "ImportJob" ADD COLUMN` exige un verrou exclusif qu'une transaction d'import ouverte bloque — hypothèse la plus cohérente avec un délai dépassé SANS erreur de rollout. NON vérifié : pas d'accès cluster depuis cette session ; (c) le contrôle de dérive des valeurs (`scripts/release-gate/detecter-derive-valeurs.mjs`, #430) plante en `Cannot find package 'yaml'` dans le job de déploiement (pas de `pnpm install` là) — masqué par `

## 💻 Codé

true`, donc le garde ajouté par #430 **ne tourne jamais**.

## ✅ Testé live

☑ 04/09

## Preuve

☑ 04/09 (`main`) — (a) sonde SEC-9 réécrite : pod jetable sans attache, verdict dans le code de sortie lu par un GET, stderr visible — et c'est cette stderr enfin visible (run 1456) qui a donné la VRAIE cause : le namespace applique **PodSecurity « restricted »** et refuse tout pod sans `securityContext` (`allowPrivilegeEscalation`, `capabilities.drop ALL`, `runAsNonRoot`, `seccompProfile`) ; l'attache websocket était une déduction, pas une mesure. Première correction par `--overrides` (`0189b2a`) : **run 1457** rollbacké à son tour, `spec.containers[0].image: Required value` — les overrides sont un merge patch et une liste `containers` y REMPLACE celle générée, le conteneur avait perdu image et commande. Le pod est désormais décrit en ENTIER dans un manifeste (`kubectl create -f -`, `be197c3`) : image, commande, `PROBE_URL`, et les quatre exigences de la politique ; y compris le cas « curl 000 = inconclusif », sans lequel une api injoignable passait pour un refus (fail-open) ; (b) hook de migration : `activeDeadlineSeconds` 600 → 300 (il expire AVANT Helm, son échec reste lisible) + `lock_timeout` 60 s injecté par `?options=` — mesuré en local : échec en 7 s avec l'erreur 55P03 au lieu d'un blocage ; (c) contrôle de dérive : corrigé entre-temps par **#436** (`ea7d10d`, JSON en amont via PyYAML, échec fatal au lieu de `\

