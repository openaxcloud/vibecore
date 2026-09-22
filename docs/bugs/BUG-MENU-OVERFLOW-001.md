---
id: BUG-MENU-OVERFLOW-001
---

## Bug

**P1 — Menu contextuel d'un message sur iPhone : le menu sort de l'écran à droite** (« Régénérer à partir de ce promp… », « Modifier le prompt et créer une… » coupés, captures 06/09 13:35) et une infobulle « Copier le message » flotte au-dessus. Le menu est placé pour une largeur ESTIMÉE de 232 px ; depuis que chaque entrée porte son libellé (BUG-MENU-LABELS-001), il s'élargit à sa `max-width` (366 px sur 390) et l'estimation le laisse à 165 px du bord. L'infobulle vient du focus posé sur la première entrée à l'ouverture. Mesuré : le test E2E existant passait en ANGLAIS (menu de ~300 px) — faux vert pris dans la mauvaise langue.

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`, 11ef764), **déployé run 1498 (abaa279), 12:35 UTC** — `ramenerDansLEcran` : le panneau est mesuré après rendu (`useLayoutEffect`) et ramené dans l'écran avec sa taille réelle ; infobulles retirées des entrées du menu (le libellé est visible, « Copié » remplace le libellé après copie). Épinglé par `app/components/chat/message-context-menu.spec.ts` (taille réelle > estimation) + `tests/e2e/ide-mobile-chrome.spec.ts` (bloc `fr-FR` : appui près du bord droit, bord droit ≤ écran − 12, libellés entiers, zéro `role=tooltip`).

## ✅ Testé live

☐

## Preuve

Captures 06/09 13:35.

