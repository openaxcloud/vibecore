---
id: BUG-UX-022
section: "Balayage QA du 2026-09-04 — panneaux instables, lenteur, archive, état de l'IDE"
---

## Bug

**Sur ORDINATEUR, `--vc-agent-composer-measured-height` n'est JAMAIS écrite : la règle d'ancrage de la pastille retombe en silence sur `bottom: 12px`.** L'effet qui publie la variable (`BaseChat.tsx:3116`) commence par `if (!useMobileIde …) return undefined;` — elle n'est donc écrite QUE sur l'IDE mobile. **Mesuré en production (`be197c3e38`), Chromium 1440×900 : `--vc-agent-composer-measured-height` = `(UNSET)`** (contre `133px` mesurée au même moment sur iPhone). Or la feuille SERVIE porte `.bolt-agent-scroll-to-bottom[data-vc-tooltip]:not([data-vc-radix-tooltip=true]){position:sticky;bottom:calc(var(--vc-agent-composer-measured-height, 0px) + 12px)}` : sans la variable, le repli `0px` s'applique et l'ancrage vaut 12 px — c'est-à-dire le bas du MÊME conteneur que la zone de saisie, laquelle porte `z-index:50` contre `20` pour la pastille. **Même motif que BUG-PANEL-CACHE-003 et BUG-PANEL-ZIP-005 : une règle livrée n'est pas une règle appliquée.** Avi travaille sur iPhone, mais ses utilisateurs seront sur ordinateur.

## 📤

—

## 💻

—

## ✅

❌

## Preuve

`pill-desktop.mjs` (mesure `(UNSET)` en prod) + la feuille servie `/assets/index-B9vvI5YB.css`. **Portée honnête : la variable non écrite est MESURÉE ; le recouvrement par la zone de saisie qui en découle est DÉDUIT de la feuille servie, pas observé** — ma sélection de conteneur défilant est tombée sur Monaco (`scrollHeight` 16 777 216) et la pastille n'a pas été trouvée sur ordinateur. À observer avant de le déclarer P1.

