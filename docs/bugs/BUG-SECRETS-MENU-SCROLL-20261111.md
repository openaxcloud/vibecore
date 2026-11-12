---
id: BUG-SECRETS-MENU-SCROLL-20261111
section: "Promotion IDE locale du 11 novembre 2026"
---

# Menu Secrets ancré après défilement

## Bug

Un défilement interne du menu ne doit pas le fermer; le déplacement de son bouton d’ancrage doit le fermer sans dérober le focus.

## 📤 Dispatché

Préparé le 11 novembre 2026, puis intégré dans main via PR895.

## 💻 Codé

Fusionné dans main via PR895 au commit 4b96f9efffe2d66de22bf8cffe619f362da46ada. Intégration dans la branche expérimentale préparée localement, non publiée.

## ✅ Testé live

Recette live non validée. La fusion du code ne constitue pas une validation en conditions réelles ni une recette responsive.

## Correction et périmètre

Portage ciblé du commit 267e5f8f4c6da0197cb42c128f7d73f43535cc39. Aucun affichage de date supplémentaire importé.

Base exacte : `aea6e1dfbac93eb9da097a27d0ac8eb5ffbb7fc5` (PR894). Les résultats de PR893 ne constituent pas une acceptation de ce portage.

## Vérification locale

`app/components/chat/secrets-menu-focus.spec.tsx` : 14 cas de focus, Escape, fermeture extérieure et défilement du menu/ancre.

Sources de produit revues : PR893 jusqu’à `014cf3a4790ef421936f0aaec92bdff6b2f158a0`; correction de câblage de test reprise de `16636768acb8365f4ec64ab6657b10eeaac42e7d` quand applicable. Aucun workflow k3s/gVisor, exemption de clé payante, seed temporaire ou audit GCS actif importé.

## Déploiement

Non confirmé. Aucun déploiement n’est déduit de la fusion dans main.

## Historique de préparation

Lors de la rédaction initiale, les états étaient « Préparé localement le 11 novembre 2026. Publication non effectuée. » et « Candidat local uniquement. Ni commit publié, ni fusion dans main. ». Ils décrivaient la préparation avant PR895, pas l’état actuel. Les preuves et limites locales ci-dessus sont conservées ; aucune recette live n’est ajoutée.
