# Lot UI — préparation de la PR brouillon

Base intégrée : main `3eb70894eb00c7f56d00abdd63cefd3c0186b4c5` (#798). Merge local `05c4e412e0ad21b77a36a26dad5091f7d7bf9bde` : seul le test de provisionnement entrant change ; aucun fichier produit UI, dépendance ou configuration de build n'est modifié par ce merge. Aucun delta backend contre main. Les validations UI antérieures restent attribuées à leurs sources exactes, pas présentées comme réexécutées après merge.

Quatre fichiers produit et trois fichiers de tests couvrent quatre défauts : gouttières latérales AppShell face aux safe insets simulés, cibles Quota44px, perte de brouillon Support, minimum du bouton Support écrasé par la cascade CSS. Aucun routage partagé, hub Intégrations, moteur IDE, API backend ou workflow modifié.

## Preuves

- [Marges et garde des pages partagées](../ui-safe-content-2026-10-26/README.md).
- [Support et Quota](../ui-secondary-pages-2026-10-26/README.md).
- [Zoom natif, Compte et limite WebKit](../ui-browser-coverage-2026-10-26/README.md).
- [Revue finale indépendante](final-review.md).
- [Matrice51/146/5/155](../ui-safe-content-2026-10-26/coverage-overlay-support-quota.md) et [allocation des146 routes restantes](../ui-next-allocation-2026-10-26/routes-allocation.md). Aucun de ces nombres ne signifie des pages entièrement certifiées.

Avant publication :30 PR ouvertes relues par leurs têtes exactes, toutes inchangées depuis l'inventaire précédent ; leurs listes de fichiers conservées ne chevauchent aucun des sept fichiers application de ce lot. Les opérations #768/#764 ne sont ni retentées ni contournées. Les audits Auth/Organisation suivants vivent dans des worktrees séparés et ne modifient pas la tête publiée.

## État de livraison

PR demandée en brouillon pour lancer les contrôles. **Fusion suspendue à la livraison confirmée du descendant #797/#798**, suivie par la session CI. Aucun statut de production authentifiée, de Safari/WebKit ou d'appareil physique n'est ajouté. Les fiches et l'index distinguent correction locale, intégration main et recette live.
