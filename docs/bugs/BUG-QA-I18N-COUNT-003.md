---
id: BUG-QA-I18N-COUNT-003
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug

**12 sites de l'IDE rendaient des compteurs et des phrases collés, dont 5 avec un « s » anglais ajouté à une chaîne traduite.** Rendus réels : `12rallongesmontré` (Extensions), `3donnée secrètesimporter` (Import de secrets), `5lignessera ignoré`, `8de12points de contrôle` (Historique), `9liaisons actives…` (Raccourcis), `42prod /13dev`, `Nondéploiementsencore` (états vides), `3erreurs ·5avertissements…` (Problèmes), `Ctrl+Kraccourci`, `échoué· sortir1`.

## 📤

✅

## 💻

✅

## ✅

✅

## Preuve

12 sites remplacés par **une clé par phrase**, pluralisée par i18next dans les deux langues.

