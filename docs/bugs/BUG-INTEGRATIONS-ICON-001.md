---
id: BUG-INTEGRATIONS-ICON-001
---

## Bug

**P2 — Intégrations : les pictogrammes des cartes (Trello, Asana, Figma…) sont BLANCS sur gris clair** (capture 06/09 14:40). Reproduit à l'identique sur Chromium (sonde probe-icons.mjs) : l'icône `i-ph:*` est un masque SVG posé sur la boîte, et le fond de boîte (`--vc-ide-bg-panel`, blanc) paraît à travers le masque — le fond EST la couleur du glyphe. Vaut pour bureau et téléphone, grille, liste et fiche de configuration.

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`, 7662264), **déployé run 1500 (890f4c9), 13:36 UTC** — `span[class*='i-']` dans les trois boîtes : `background-color: currentColor`, masque 22 px centré. Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§15) + `tests/e2e/ide-mobile-chrome.spec.ts` (Intégrations : fond calculé de l'icône = sa couleur).

## ✅ Testé live

☐

## Preuve

Capture 06/09 14:40.

