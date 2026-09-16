---
id: BUG-AGENT-CONV-002
---

## Bug

**P2 — ~~P0~~ RÉTROGRADÉ : la réponse de l'assistant n'était pas enregistrée côté serveur — défaut RÉEL mais SPÉCIFIQUE au SHA `fce8639ab3` de l'environnement d'audit, ABSENT de la production.** Mesuré d'abord le 2026-09-05 sur l'env d'audit : bulle assistant rendue et mesurée (75 px), puis `GET …/ai/conversations/<id>/messages` rendant **`['user']` seul**, encore plusieurs minutes après — écriture qui n'a pas lieu, pas écriture en retard. **Vérifié ensuite en base de production**, témoin posé avant comptage : **210 conversations portent au moins une réponse assistant non vide**, donc la requête sait les trouver ; sur **224** conversations et sur toute l'histoire, **une seule** est en `user` seul. Sur les **24 dernières heures : 15 conversations, 15 avec assistant, aucune** en `user` seul. La formulation « le serveur détient la moitié la moins utile du fil » vaut pour l'env d'audit et **ne décrit pas la production**.

## 📤 Dispatché

☐

## 💻 Codé

☐

## ✅ Testé live

☐

## Preuve

Mesure live env d'audit (`fce8639ab3`) : rôles `['user']`. **Contre-mesure en base de PRODUCTION : 1/224 sur toute l'histoire, 0/15 sur 24 h, témoin à 210.** Reste à établir ce qui distingue les deux environnements — régression corrigée depuis `fce8639ab3`, ou condition propre à l'audit. Aucune action urgente en production.

