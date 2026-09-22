---
id: BUG-UX-018
---

## Bug

**P3 — la carte de visite guidée de l'IDE surgit ~20 s après le chargement et VOLE le clic sur les actions du panneau de droite.** Elle se déclare pourtant `role="dialog" aria-modal="false"` : un dialogue non modal ne doit pas bloquer l'application derrière lui. Elle apparaît alors que l'utilisateur est déjà au travail, et recouvre la zone d'actions du panneau de service.

## 📤 Dispatché

☐

## 💻 Codé

☑ 09/09

## ✅ Testé live

**Revérifié le 09/09 : déjà corrigé.** Le conteneur de la visite guidée porte `pointer-events-none` et seule la carte reprend `pointer-events-auto` : elle ne peut plus voler un clic destiné au tableau de bord.

## Preuve

☐ live iPhone

