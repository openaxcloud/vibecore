---
id: BUG-AGENT-ACTION-RESSUSCITEE-001
---

## Bug

**P2.** Une action de fichier ANNULÉE était ressuscitée en « En cours » définitif. `runAction(data, true)` passe par un `createSampler` de 100 ms dont l'appel de queue est armé par un `setTimeout` que rien n'annule : un Arrêt pendant qu'un fichier streame laissait partir un dernier appel jusqu'à 100 ms APRÈS l'annulation. `#executeAction` posait « running » inconditionnellement, puis la mise à jour terminale reposait encore « running » — le contrôle du signal n'existait QUE sur la branche non-streamée. Rien ne le redescendait ensuite.

## 📤 Dispatché

☑ 10/09

## 💻 Codé

☑ 10/09

## ✅ Testé live

☐

## Preuve

l'annulation prime maintenant sur les deux branches, et une action déjà annulée sort avant toute écriture + épinglé par `app/lib/runtime/action-annulee-non-ressuscitee.spec.ts` (3 tests). Contre-épreuve : les deux moitiés retirées → 2 rouges. Contrôle négatif : sans Arrêt, le même enchaînement laisse bien « running ». Commit `30addfe04`. **DÉPLOYÉ EN PRODUCTION** le 2026-09-10 par le run 1597 de `deploy-main.yml` (SHA `e435692a1`, qui contient ces commits — vérifié par `merge-base` et par le comptage des marqueurs à ce SHA) : `Helm upgrade` 11:00:52→11:07:45, `Verify rollout` ✅, et surtout `Verify running imageIDs match the release manifest` ✅ — les pods qui tournent portent bien les images construites depuis ce commit ; l'étape de rollback est restée `skipped`. ⚠️ Le déploiement n'est PAS une vérification live : la colonne ✅ reste ouverte tant que le comportement n'a pas été constaté à l'écran.

