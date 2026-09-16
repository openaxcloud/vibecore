---
id: BUG-UX-011
---

## Bug

Une panne du loader principal de plusieurs surfaces hors IDE remonte jusqu'à la boundary racine, tandis qu'une navigation entre panneaux ne présente aucun skeleton local

## 📤 Dispatché

✅

## 💻 Codé

✅

## ✅ Testé live

✅

## Preuve

`4652a247` poussé sur `main`. Boundary assainie et récupérable sur 23 routes AppShell/ProjectShell hors IDE, retry réel et skeleton local pendant les transitions SPA. Playwright : réponse API réelle retardée puis libérée sur desktop/tablette/mobile (`12 passed`, `3 skipped`) ; panne API injectée sur Dashboard, API keys, Organization members et Data & privacy (`3/3`), clair 1440 et sombre 390, sans overflow et avec retry ≥44 px. Captures `user-area-navigation-loading-*`, `dashboard-error-*`, `api-keys-error-*`. Gates : typecheck, lint 0 erreur, build production, 521 fichiers et 3 876 tests verts.

