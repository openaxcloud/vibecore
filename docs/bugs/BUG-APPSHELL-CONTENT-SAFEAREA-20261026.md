---
id: BUG-APPSHELL-CONTENT-SAFEAREA-20261026
---

## Bug

Le contenu AppShell empiète de4px sur la marge sûre latérale en paysage.

Avant11299, Security à844×390 avec insets CDP gauche/droite47px : padding extérieur21px et intérieur22px placent le champ àx43. Le header avait sa propre protection, mais pas la gouttière du contenu. Contrepreuve DOM séparée : max(marge existante,inset) donne padding47px et champx69.

Correctif limité aux classes de padding horizontal du wrapper de contenu dans `app/components/dashboard/SaaSLayout.tsx`. Aucun changement de navigation, header, API ou styles globaux. Les exceptions de contenu personnalisé restent inchangées.

## 📤 Dispatché

☑ 26/10/2026 — Lot UI local autorisé ; périmètre coordonné et revue indépendante des preuves/correctifs.

## 💻 Codé

☐ Sur main. Correctif conservé localement dans `6491798` ; branche intégrant origin/main `3eb70894e`, tête d’intégration `05c4e412e`. Cette fiche ne déclare ni fusion de ce lot UI ni livraison.

## ✅ Testé live

☐ En production. Tests Chromium locaux et données synthétiques seulement ; aucune recette authentifiée de production ni action client réelle.

## Validation locale et preuves

37 tests existants, lint, typage web strict et build réussis. Après11399 :32 observations FR/EN ×clair/sombre ×320×900/390×844/844×390/820×1180 ×insets nuls/simulés. Les4 paysages passent x43→69 ; les28 autres géométries restent identiques. Quatre groupes saisie/focus/resize/Escape/Retour, gardes projects/new padding0 et SIEM scroll local, huit états sidebar1024/1440.

[Avant, contrepreuve et après compilé](ui-safe-content-2026-10-26/README.md), [revue indépendante](ui-safe-content-2026-10-26/final-review.md). Les32 observations ne sont pas32 parcours complets. Simulation Chromium CDP uniquement ; pas de preuve iOS physique. Le champ peut encore toucher le bas du viewport après resize : cette correction est horizontale, sans certification du focus vertical, footer ou contenu personnalisé.

Les versions de chaque reçu restent distinctes ; l’intégration ultérieure de main ne constitue pas un replay navigateur. Aucun nouveau test produit exécuté pour rédiger cette fiche. Les états main et live restent faux jusqu’à preuves séparées.
