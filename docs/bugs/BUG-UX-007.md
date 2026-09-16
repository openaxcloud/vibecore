---
id: BUG-UX-007
---

## Bug

Les panneaux « Organization members » et « Data & privacy » peuvent remplacer leur contenu par une erreur de route sans état local récupérable

## 📤 Dispatché

✅

## 💻 Codé

✅

## ✅ Testé live

✅

## Preuve

`7523f14e` poussé sur `main`. Injection de panne réelle via une instance web reliée à un port API indisponible : contrôles membres/export/suppression masqués, message explicite, retry fonctionnel et cible ≥44 px, sans débordement à 1440 clair et 390 sombre. Captures `organization-members-error-*` et `account-data-error-*` ; matrice Playwright `0642266a` verte.

