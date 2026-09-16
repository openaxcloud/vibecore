---
id: BUG-AGENT-MSGID-001
---

## Bug

**P0.** Le SDK génère un `messageId` NEUF à chaque appel `streamText` et à chaque frontière d'étape outil, et le pousse au client dans la part `start_step` ; le client réécrit `message.id` EN PLEIN FLUX. Une continuation étant un nouvel appel fusionné dans le MÊME flux, l'identifiant changeait à la couture. Deux dégâts : (a) `StreamingMessageParser` indexe son état par identifiant → état neuf → position 0 → RE-PARSE de tout le message : réponse dupliquée, second artefact sous un `ActionRunner` neuf, et actions `shell` du segment 1 (`npm install`, démarrage du serveur) RELANCÉES ; (b) la transcription est upsertée sur `sha256(conversationId:message.id)` → INSERT d'une ligne jumelle, la moitié tronquée reste en base.

## 📤 Dispatché

☑ 10/09

## 💻 Codé

☑ 10/09

## ✅ Testé live

☐

## Preuve

mécanisme vérifié dans `node_modules/ai/dist/index.mjs` (5969, 5989, 6217) et `@ai-sdk/ui-utils` + épinglé par `app/routes/api.chat.identifiant-de-message-stable.spec.ts` (7 tests). Contre-épreuve : câblage de l'appel initial retiré → 1 rouge. Un test vérifie que l'option existe sous ce nom exact dans le SDK installé. Commit `1fd5956a4`. **DÉPLOYÉ EN PRODUCTION** le 2026-09-10 par le run 1597 de `deploy-main.yml` (SHA `e435692a1`, qui contient ces commits — vérifié par `merge-base` et par le comptage des marqueurs à ce SHA) : `Helm upgrade` 11:00:52→11:07:45, `Verify rollout` ✅, et surtout `Verify running imageIDs match the release manifest` ✅ — les pods qui tournent portent bien les images construites depuis ce commit ; l'étape de rollback est restée `skipped`. ⚠️ Le déploiement n'est PAS une vérification live : la colonne ✅ reste ouverte tant que le comportement n'a pas été constaté à l'écran.

