---
id: BUG-UX-003
---

## Bug

Les actions d’en-tête « Resume project » et « Choose project » font doublon avec la grille triée par activité et le bouton « Open IDE » de chaque projet

## 📤 Dispatché

✅

## 💻 Codé

✅

## ✅ Testé live

✅

## Preuve

`a328f3a1` poussé sur `main`. Validé en réel avec deux projets triés par activité : aucun CTA Resume/Choose, deux liens Open IDE et New project conservé. Captures `dashboard-project-actions-{light,dark}.jpg` ; matrice Playwright `0642266a` verte.

