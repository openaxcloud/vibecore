---
id: BUG-EDITOR-HISTORY-001
---

## Bug

**P3 — Éditeur sur iPhone : la pastille « Historique » est coupée à moitié** par le bas de son conteneur, qui passe sous la barre de Safari. Capture 06/09 11:01. Non reproductible sur Chromium (conteneur au ras du socle).

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`) — **déployé run 1490 (84a913c), 10:27 UTC** — pastille fixée au-dessus du socle avec la formule des feuilles du composeur (socle + zone sûre + fenêtre visuelle). Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§8) + `tests/e2e/ide-mobile-chrome.spec.ts` (fixée, au-dessus du socle). **Non vérifié sur WebKit** : le défaut n'existe que là.

## ✅ Testé live

☐

## Preuve

Capture 06/09 11:01.

