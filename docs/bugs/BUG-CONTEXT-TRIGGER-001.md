---
id: BUG-CONTEXT-TRIGGER-001
---

## Bug

**P2 — « Contexte » coupé à gauche (« ontexte ») sous un message de l'agent** (capture 06/09 17:56). La règle mobile `width: 32px` datait du déclencheur-icône ; avec son libellé, le contenu centré débordait des deux côtés et la ligne rognait la gauche.

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`), **déployé au plus tard run 1508 (b1b2475), 21:15 UTC** — `width: auto; min-width: 32px` sur téléphone. Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§17). Le vrai chemin exige une annotation de contexte que l'API de semis ne porte pas : preuve iPhone à prendre.

## ✅ Testé live

☐

## Preuve

Capture 06/09 17:56.

