---
id: BUG-IDE-MOBILE-SCALE-001
---

## Bug

**P1 — tout le chrome des panneaux de l'IDE est trop gros et tronqué sur iPhone** (quatre captures d'Avi 06/09 : onglets des journaux de la Webview, barre d'adresse, état de départ de l'Agent aux puces coupées, Journaux). Mesuré à 390 sur le build prod : `.text-xs` rendu **9 px**, `text-[11px]` rendu **14 px**, boutons `h-7` à 44 px et 65 px de large sur trois lignes (Débogueur), feuille « + » aux descriptions 9 px coupées à deux lignes, « Améliorer project/README.md » coupé à 143 px pour 239, « Économique » à 87 px pour 96. Cause unique : la règle de coquille `.bolt-project-ide-shell :where(div, span, button…) { font-size … !important }` aplatit tout à 14 px et `--vc-type-label-size` valait 9 px sous 1024 px.

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`) — **déployé run 1490 (84a913c), 10:27 UTC** — échelle du chrome des panneaux (`.bolt-workbench-mobile`) 13 / 12 / 11 / 10 px à (0,4,0) + `!important`, en-têtes qui se replient, légende 11 px ; état de départ en une colonne ; « Économique » entier par les marges des sélecteurs. **Run 1481 refusé** par TACTILE-001 (`ide-touch-targets.spec.ts` : boutons à 36 / 40 px sous le plancher de 44) — cibles remises à 44 px, seuls la police et le repli rendent la place ; feuille « Panneaux » (⋮) à 12 px sans coupe (capture 10:34). Audit 33 panneaux : 11 troncatures → 1 (en-tête gelé, IDM-09). Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§4–6, rouge 16/24 sans le correctif) + `tests/e2e/ide-mobile-chrome.spec.ts` (6 tests, mesures calculées).

## ✅ Testé live

☐

## Preuve

Captures iPhone 06/09 ; preuves live locales Chromium — **non vérifié sur WebKit**.

