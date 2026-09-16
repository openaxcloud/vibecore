---
id: BUG-LOGS-MOBILE-001
---

## Bug

**P2 — panneau Journaux sur mobile : la barre d'outils occupe plus de la moitié de l'écran** (capture 05/09 23:00) : cinq rangées (Console / Journaux des flux ; Journaux système / Environnement d’exécution : Actif ; Tous 0 / Informations 0 / Avertissements 0 / Erreurs 0 ; champ de recherche réduit à « Journaux c » + Expression régulière ; Effacer / Vue fractionnée ; Exporter le .txt / Queue vivante / Recharger), boutons de trois styles différents, police 17 px. La zone de journaux commence sous 60 % de la hauteur.

## 📤 Dispatché

☑ 05/09

## 💻 Codé

☑ 06/09 (`main` `0e1361c`, déployé run 1480) — une famille de boutons (28 px, 12 px), vue fractionnée masquée ; **mesuré après : encore sept rangées, 261 px**. Repris le 06/09 (BUG-IDE-MOBILE-SCALE-001) : trois rangées, 125 px, actions en icônes. Épinglé par `app/styles/ide-mobile-panels.spec.ts` + `tests/e2e/ide-mobile-chrome.spec.ts`.

## ✅ Testé live

☐

## Preuve

Capture iPhone 23:00 ; capture 06/09 (Journaux).

