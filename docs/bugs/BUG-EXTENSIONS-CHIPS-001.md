---
id: BUG-EXTENSIONS-CHIPS-001
---

## Bug

**P3 — Extensions : la rangée des domaines défile sur une ligne et la dernière pastille visible est coupée au bord (« web browsi »)** (capture 06/09 14:40).

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`, 7662264), **déployé run 1500 (890f4c9), 13:36 UTC** — les pastilles se replient (`flex-wrap: wrap`), plus de défilement horizontal. Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§15) + `tests/e2e/ide-mobile-chrome.spec.ts` (Extensions : rangée sans débordement, pastilles entières).

## ✅ Testé live

☐

## Preuve

Capture 06/09 14:40. Le menu contextuel de la capture 14:41 est déjà corrigé (BUG-MENU-OVERFLOW-001, `11ef764`), pas encore déployé à cette heure.

