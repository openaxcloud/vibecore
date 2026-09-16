---
id: BUG-AGENT-ORDER-001
---

## Bug

**P1 — les messages d'un fil peuvent revenir dans le DÉSORDRE au rechargement (réponse avant la question).** `AiMessage.createdAt` est à la milliseconde (`timestamp(3)`) ; la question et la réponse d'un même tour (`app.ts` : deux `createAiMessage` consécutifs) ou une transcription synchronisée en rafale partagent souvent cette milliseconde, et `ORDER BY createdAt` ne départage pas les ex æquo : selon le plan Postgres (parcours d'index ou tri instable) l'ordre change. Mesuré en local 05/09 : **3 transcriptions sur 20** avec au moins deux messages à la même ms. C'est la cause des rouges CI « sans changement de code » de `agent-message-density.spec.ts` (E2E 1339, 1351, 1410 : lignes user/assistant permutées → survol/appui sur la mauvaise ligne, dernière ligne qui n'est pas la réponse, menu contextuel d'une bulle utilisateur sans actions d'assistant) — verts en local sur le même build, où l'horloge avance entre deux insertions.

## 📤 Dispatché

☑ 05/09

## 💻 Codé

☑ 05/09 (`main` `f622401`, **déployé** — runs 1476/1478 verts, 06/09 00:54 et 01:44 UTC) — `services/api/src/horodatage-message.ts` : chaque message reçoit un instant STRICTEMENT croissant (ms courante ou précédente + 1) posé par `createAiMessage` ; `listAiMessages` départage par `id`. Mesuré après : **0 égalité sur 40 transcriptions** (`ordre.mjs`, API locale). Épinglé par `services/api/src/ai-message-order.spec.ts` (horloge figée → instants strictement croissants ; rafale de 4 créations avec et sans id → createdAt croissants ; lecture `orderBy [createdAt, id]`) — rouge 2/4 sans le magasin corrigé, 4/4 avec.

## ✅ Testé live

☐

## Preuve

Preuve live à prendre après déploiement : recharger un fil synchronisé en rafale, l'ordre question/réponse doit tenir à chaque rechargement ; et l'E2E de densité ne doit plus rougir « sans changement de code ».

