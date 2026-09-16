---
id: BUG-COMPOSER-MENUS-IOS-001
---

## Bug

**P1 — Zone de saisie sur iPhone : les menus « Agent » et « Économique » s'ouvrent mais on ne voit rien** (Avi, 06/09 17:57 ; la capture montrait « Turbo … Coût estimé » grisés sous le fil). Les menus se rendent dans le composeur, puis une règle mobile les pose en `position: fixed` ; entre le composeur et l'écran, la colonne du panneau porte `container-type: inline-size` (confinement de mise en page = bloc conteneur des descendants fixés), le composeur est collant avec son contexte d'empilement, le fil défile. Chromium replace la feuille où on l'attend ; WebKit la laisse derrière le composeur. WebKit indisponible ici (téléchargement bloqué).

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`, déployé run 1509 (13ba717), 23:04 UTC) — les deux menus se rendent par portail à la racine du gabarit mobile (`feuille-mobile.ts`), hors de toute chaîne qui les borne ; le test « clic dehors » compte le menu porté. Épinglé par `app/components/chat/feuille-mobile.spec.ts` + `tests/e2e/ide-mobile-chrome.spec.ts` (zone de saisie : menus hors du composeur, sous aucun ancêtre confiné, dans l'écran, un appui dedans ne ferme pas). **Preuve iPhone à prendre.**

## ✅ Testé live

☐

## Preuve

06/09 17:57.

