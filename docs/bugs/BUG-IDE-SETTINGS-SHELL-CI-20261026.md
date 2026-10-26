---
id: BUG-IDE-SETTINGS-SHELL-CI-20261026
---

## Bug

Signal CI #802, run 40269242521 : le test de lisibilité claire n'obtient pas le shell IDE pour Settings après deux navigations et 60 secondes. La mesure de couleur n'est pas atteinte. Le test passe au retry 1 ; cela ne démontre pas un défaut de contraste.

## 📤 Dispatché

26/10/2026 — lecture des journaux officiels et reproduction locale ciblée, sans mutation GitHub ou production.

## 💻 Codé

☐ — aucun correctif spéculatif : absence du shell non reproduite localement, cause CI encore indéterminée.

## ✅ Testé live

☐ — aucune production. Le test exact des vingt panneaux réussit localement en 55,2 secondes, sans retry automatique ; un seul appel page.goto concerne Settings et les mesures de couleur sont atteintes. Le tout premier lancement n'avait exécuté aucune assertion, car le binaire Playwright par défaut était absent ; le harnais a ensuite utilisé Chromium déjà installé, sans installation supplémentaire.

Preuves et limites : `ide-navigation-pr802-2026-10-26/README.md`.
