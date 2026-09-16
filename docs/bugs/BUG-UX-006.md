---
id: BUG-UX-006
---

## Bug

La route `/account-settings/data` marque simultanément « Account » et « Data & privacy » comme éléments actifs dans la sidebar

## 📤 Dispatché

✅

## 💻 Codé

✅

## ✅ Testé live

✅

## Preuve

`93ba2248` poussé sur `main`. Une seule ancre visible porte `aria-current="page"`, avec le libellé « Data & privacy ». Capture `account-data-light-1440.jpg` et matrice Playwright `0642266a` verte.

