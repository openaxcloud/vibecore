---
id: BUG-STUDIO-PATCHLIST-001
---

## Bug

**P1 — Studio de l'agent, « Modifications de l'IA en attente » : cinq fichiers rognés sur 20 px chacun, chemins coupés** (capture 06/09 14:38). Les cartes portent `overflow-x: auto` sur téléphone, ce qui ramène leur taille minimale automatique à zéro ; dans une grille bornée (`max-height` 24 dvh), les rangées `auto` se serrent pour tenir dans la boîte au lieu de la faire défiler. Le conteneur (38 dvh, `overflow: hidden`) rognait le reste.

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`, 7662264), **déployé run 1500 (890f4c9), 13:36 UTC** — `grid-auto-rows: max-content` (une rangée vaut son contenu) ; dans le Studio, plus de plafond ni de rognage (la page défile) ; « Acceptez tout / Rejeter tout » côte à côte. Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§15) + `tests/e2e/ui-details.spec.ts` (cinq cartes dans le Studio : chacune ≥ 40 px, aucune rognée).

## ✅ Testé live

☐

## Preuve

Capture 06/09 14:38.

