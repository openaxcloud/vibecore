---
id: BUG-AGENT-ARRET-STATUT-001
---

## Bug

**P1.** Après un Arrêt, la ligne de statut restait « en cours » avec son animation, indéfiniment. Le SDK avale l'AbortError sans appeler `onFinish` ni `onError` : `setData(undefined)` — qui ne vit que dans `onFinish` — ne s'exécute jamais, la dernière annotation `{response, in-progress}` reste dans `data`, `failed` reste faux (un abandon ne produit pas d'erreur) et `streaming` retombe à faux. `deriveProgressState` rendait « working » : l'anneau tournait pour toujours sous un composeur libéré.

## 📤 Dispatché

☑ 10/09

## 💻 Codé

☑ 10/09

## ✅ Testé live

☐

## Preuve

un flux mort avec du travail annoncé vivant est désormais une INTERRUPTION ; `streaming === false` explicitement, pour ne pas convertir une ignorance en interruption + épinglé par `app/components/chat/qa-status-truth.spec.ts` (+5 tests, dont le contrôle « signal absent → comportement d'origine »). Commit `30addfe04`. **DÉPLOYÉ EN PRODUCTION** le 2026-09-10 par le run 1597 de `deploy-main.yml` (SHA `e435692a1`, qui contient ces commits — vérifié par `merge-base` et par le comptage des marqueurs à ce SHA) : `Helm upgrade` 11:00:52→11:07:45, `Verify rollout` ✅, et surtout `Verify running imageIDs match the release manifest` ✅ — les pods qui tournent portent bien les images construites depuis ce commit ; l'étape de rollback est restée `skipped`. ⚠️ Le déploiement n'est PAS une vérification live : la colonne ✅ reste ouverte tant que le comportement n'a pas été constaté à l'écran.

