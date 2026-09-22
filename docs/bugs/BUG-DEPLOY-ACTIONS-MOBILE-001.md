---
id: BUG-DEPLOY-ACTIONS-MOBILE-001
---

## Bug

**P2 — Déploiements « Gérer » sur iPhone : « Redéployer / Restauration / Annuler » empilés sur trois lignes, chacun étroit** (capture 06/09 14:10). Mesuré à 390 (sonde probe-deploy.mjs) : grille d'une colonne (règle de conteneur du volet de bureau, `display: grid !important`), trois formulaires de 44 px ; la largeur pleine n'était donnée qu'aux liens, les actions sont des formulaires.

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`), **déployé run 1498 (abaa279), 12:35 UTC** — sur téléphone : ligne qui se replie (`display: flex !important` à (0,3,0)), chaque action `flex: 1 1 100px`, bouton pleine part et 44 px. Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§13) + `tests/e2e/ide-mobile-chrome.spec.ts` (déploiement semé, actions sur UNE ligne, boutons ≥ 44 px).

## ✅ Testé live

☐

## Preuve

Capture 06/09 14:10.

