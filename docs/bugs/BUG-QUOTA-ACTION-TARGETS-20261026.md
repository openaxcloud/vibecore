---
id: BUG-QUOTA-ACTION-TARGETS-20261026
---

## Bug

Les deux liens d’action Quota mesurent34px sur desktop malgré l’objectif produit44px.

Avant11499 :16 observations desktop1280/1440/1920/2560 ×FR/EN×thèmes reproduisent les deux cibles34px. La classe `min-h-11` dépend du rem réduit. Contrepreuve DOM1440 sur4 modes : huit liens34→44px ; preuve distincte du build.

Correctif local dans `app/routes/quota-exceeded.tsx` : `min-h-11` remplacé par `min-h-[44px]` sur les deux liens. Destinations, libellés, repli et focus conservés. Garde existante adaptée dans `plan-quota.i18n.spec.tsx`, sans modification du composant partagé.

## 📤 Dispatché

☑ 26/10/2026 — Lot UI local autorisé ; périmètre coordonné et revue indépendante des preuves/correctifs.

## 💻 Codé

☐ Sur main. Correctif conservé localement dans `e35d1cf7d` ; branche intégrant origin/main `3eb70894e`, tête d’intégration `05c4e412e`. Cette fiche ne déclare ni fusion de ce lot UI ni livraison.

## ✅ Testé live

☐ En production. Tests Chromium locaux et données synthétiques seulement ; aucune recette authentifiée de production ni action client réelle.

## Validation locale et preuves

Garde rouge conservée, tests et lint ciblés verts ; build et typage consolidés réussis. Après11599 :44 observations aux11 formats320/360/390/paysage844/768/820/1024/1280/1440/1920/2560 ×FR/EN×thèmes ;88 mesures de liens≥44px, contenu et document contenus, zéro erreur JS. Quatre groupes clavier Comparer/Escape/Enter/Back. Aucun Upgrade, achat, checkout ou portail activé.

[Avant et contrepreuve](ui-secondary-pages-2026-10-26/quota-downgrade/before11499/README.md), [recette compilée11599](ui-secondary-pages-2026-10-26/quota-downgrade/after11599/README.md). Le seuil44px est une exigence produit, pas une déclaration automatique de violation WCAG. Downgrade est un parcours voisin observé, pas un défaut corrigé par cette fiche. Le [complément zoom11799](ui-browser-coverage-2026-10-26/zoom/README.md) reste une phase séparée avec ses limites de captures et tailles CSS.

Les versions de chaque reçu restent distinctes ; l’intégration ultérieure de main ne constitue pas un replay navigateur. Aucun nouveau test produit exécuté pour rédiger cette fiche. Les états main et live restent faux jusqu’à preuves séparées.
