---
id: BUG-ACTIVITY-NARROW-FILTERS-20261028
---

## Bug

La grille des filtres Activity impose640px dans un panneau desktop de588px et coupe Refresh/Period.

## 📤 Dispatché

☑ 28/10/2026 — diagnostic reproduit localement sur données synthétiques.

## 💻 Codé

☐ main — lot local distinct des têtes838/839 ; aucune fusion ni livraison.

## ✅ Testé live

☐ production — Chromium local, aucune donnée cliente ni opération réelle.

## Correction et validation

Une seule propriété de grille devient auto-fit selon largeur réelle.70 gardes existantes passent ; cinq recettes compilées390/820/1280/1536/1920 passent, avec split réel et resize pendant saisie. Revue indépendante favorable.

Pas de certification globale, appareil physique ou backend réel. Les erreurs de sonde et timeouts initiaux restent documentés dans les reçus ; aucun seuil ni contrôle de CI n’est réduit.

Reçus détaillés et limites : [dossier de preuves](ui-agent-data-panels-evidence-20261028/README.md).
