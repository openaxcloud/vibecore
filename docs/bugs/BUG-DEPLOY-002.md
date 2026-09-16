---
id: BUG-DEPLOY-002
---

## Bug

**P1 — l'activation par mot de passe d'un déploiement répond 503 `DEPLOYMENT_ACCESS_ACTIVATION_DISABLED` en production : l'interlock SEC-8 est resté à 0 et la chaîne ne peut plus l'armer.** Lu dans le journal du run 1460 : « live activation flag : '' » (clé absente du configmap — elle valait 1 au run 1435, perdue entre les révisions 1128 et 1140 par des opérations Helm manuelles), donc CUTOVER : phase 1 à 0, sonde verte, puis `SEC-10: the api Deployment runs …/api@sha256:…, which is not built from the certified commit` → phase 2 sautée → vérification finale `expected '1'`, got '0' → job rouge sans rollback. Cause : SEC-10 comparait l'image au motif `*:<sha10>`, impossible depuis le déploiement par DIGEST — la phase 2 ne pouvait plus JAMAIS armer, à aucun cutover.

## 📤 Dispatché

☑ 04/09

## 💻 Codé

☑ 04/09 (`main` `e056248`) — la barrière certifie une image épinglée par digest via le manifeste de release (digest de l'entrée `api` + tag/sourceSha du commit certifié) ; la vérification finale attend la valeur de phase 1 quand l'armement a été RETENU, avec avertissement, au lieu de rougir un déploiement sain. Épinglé par `scripts/deploy-activation-sequencing.spec.mjs` (les vrais scripts des deux étapes exécutés : digest certifié → armable ; autre commit / digest absent / sans manifeste → fermé ; retenu → phase 1 + avertissement ; armé → exige 1) — rouge 2/22 sur `be083cd`, 22/22 verts avec.

## ✅ Testé live

✅ **04/09 21:14 UTC — run 1465 (push #443, `914facc`), journal lu ligne à ligne** : « live activation flag : '0' » → CUTOVER, révision 1142, rollout de 7 Deployments vérifié, sonde SEC-9 `phase=Succeeded exit=0 http=401`, **« SEC-10 ok: running api image is built from the certified commit 914facc791 »** sur une image `api@sha256:9a5eb475…`, « barrier: CLEARED — 93s elapsed with zero pre-cutover pods », phase 2 → révision 1143, **« configmap DEPLOYMENT_ACCESS_ACTIVATION_ENABLED='1' (expected '1') »**, run VERT — premier déploiement vert depuis le run 1435. Épinglé par `scripts/deploy-activation-sequencing.spec.mjs`. Reste à confirmer côté produit : `PATCH …/deployments/:id/access` en `mode=password` → 200 sur un déploiement statique (l'interlock ne répond plus 503).

## Preuve

Chaîne complète ré-exercée en réel : cutover → sonde → SEC-10 par digest → barrière → phase 2 → vérification. Un dispatch MANUEL de l'E2E fait rougir la porte du déploiement suivant (run 1464 : « run event 'workflow_dispatch' is not in allowedEvents [push] », le run annulé 1359 pris pour le run du SHA) — ne pas dispatcher e2e.yml à la main tant que la porte choisit le dernier run et non le run push.

