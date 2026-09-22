---
id: BUG-UX-012
---

## Bug

Les cartes projet étirent leur contenu, hiérarchisent mal l'aperçu et ne rendent pas le statut, l'activité et l'action principale assez scannables selon la largeur

## 📤 Dispatché

✅

## 💻 Codé

✅

## ✅ Testé live

✅

## Preuve

Grille `auto-fit` plafonnée à 26 rem, aperçu réel/fallback honnête, statut superposé, activité, déploiements et CTA Open IDE ≥44 px. Playwright réel avec deux projets : 1 colonne à 390, 2 colonnes à 768/1024/1440, largeur plafonnée et zéro débordement. Captures clair/sombre et tablette dans `docs/ui-ux-evidence/2026-07-15/`.

