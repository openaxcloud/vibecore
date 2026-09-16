---
id: BUG-ENV-SCOPES-001
---

## Bug

**P2 — Variables d'environnement : l'onglet « Fabrication » recouvert par « Portées différentielles »** (capture 06/09 17:56). Mesuré à 390 : bande de 203 px pour 313 px de contenu à côté du bouton de 147 px.

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`), **déployé au plus tard run 1508 (b1b2475), 21:15 UTC** — sur téléphone la rangée se replie : bande pleine largeur, bouton dessous. Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§17) + `tests/e2e/ide-mobile-chrome.spec.ts` (Variables : bande > 300 px sans débordement).

## ✅ Testé live

☐

## Preuve

Capture 06/09 17:56.

