---
id: BUG-ADMIN-BILLING-LONG-PLAN-OVERFLOW-20261026
---

## Bug

Un nom d’offre long déborde le sélecteur et la carte de Facturation admin, élargissant le body et coupant le contenu sur mobile.

À320px, body1743px malgré html320 ; select1695px dans parent225 et nom1421px dans parent202. Vingt contextes FR/EN clair/sombre, cinqformats, reproduisent le dépassement body.

## 📤 Dispatché

☑ 26/10/2026 — Périmètre Administration P2 isolé ;32PR relues sans chevauchement. Revue parent favorable du delta local et de la contrepreuve.

## 💻 Codé

☐ Sur main. Local : min-w-0 sur select et max-w-full sur strong nom d’offre ; aucun contrat/action/permission ni composant partagé modifié.

## ✅ Testé live

☐ En production. Données synthétiques GET uniquement ; aucune opération financière.

## Validation locale

18tests existants sur2fichiers verts, lint ciblé0. Contrepreuve DOM body1743→320,select1695→225,nom1421→202. Buildcommun P2 réussi ;20observations compilées13299 sur5formats FR/ENthèmes et4parcours clavier/resize passent. Body et contrôles contenus, nom/valeurs conservés ; aucune livraison présumée.

## Preuves et limites

[Audit et six IDs](ui-administration-2026-10-26/README.md). Chromium local ; contenus dynamiques, autres sections admin, zoom200%, autres navigateurs et mutations non validés. Boutons Users compacts relevés séparément, hors de ce correctif.
