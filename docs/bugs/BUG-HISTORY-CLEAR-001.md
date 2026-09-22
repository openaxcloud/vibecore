---
id: BUG-HISTORY-CLEAR-001
---

## Bug

**P1 — « Effacer l'historique » (via « Nouvelle discussion ») n'ouvre pas une nouvelle conversation** — Avi 06/09 : « quand j'efface l'historique ça ouvre pas une nouvelle conversation ». Mesuré sur la maquette (probe-clear.mjs) : 4 messages avant, 4 après confirmation, puis les 4 RE-PERSISTÉS dans une conversation neuve. Deux mécanismes : (1) l'effet « transcription arrivée après le montage » réadopte `initialMessages` dès que le fil repasse à zéro ; (2) au rechargement, le repli serveur `?limit=1` retrouve la DERNIÈRE conversation — celle qu'on vient d'effacer — parce que la suivante n'est créée qu'au premier envoi.

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`, 11ef764), **déployé run 1498 (abaa279), 12:35 UTC** — `fautIlAdopterLaTranscriptionRestauree` reçoit `dejaAdoptee` (une transcription ne s'adopte qu'une fois ; `resetChat` la marque adoptée) ; `resetChat` ouvre tout de suite une conversation neuve (`ensureProjectAiConversation`), qui devient la plus récente. Épinglé par `app/components/chat/late-stored-transcript.spec.ts` (`dejaAdoptee`) + `tests/e2e/ide-mobile-chrome.spec.ts` (bloc `fr-FR` : Nouvelle discussion → confirmation → 0 message, conversation courante différente, toujours 0 après rechargement).

## ✅ Testé live

☐

## Preuve

Capture 06/09 13:34.

