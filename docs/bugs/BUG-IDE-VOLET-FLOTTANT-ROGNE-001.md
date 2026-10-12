---
id: BUG-IDE-VOLET-FLOTTANT-ROGNE-001
---

## Bug

Le volet flottant déborde du canevas central et son bord droit est masqué par la bibliothèque, y compris une partie de la commande de réancrage. Reproduit dans Chromium local à 1440 × 900 sur main `dfd1d1f071a2e19a516833e8fff491fb5a818bd0` : bord droit du cadre 1189 px, canevas 1158,27 px. Capture réelle inspectée. Le défaut revient après passage par les largeurs 768 et 390 puis retour à 1440.

## 📤 Dispatché

☑ — tâche déléguée du 12 octobre 2026, branche `codex/floating-pane-viewport-20261012`.

## 💻 Codé

☐ — correctif local validé sur son périmètre, non poussé et non fusionné.

## ✅ Testé live

☐ — production non testée ; Save et preview hors périmètre validé.

## Contraintes existantes

Le cadre doit rester dans `.bolt-project-main-panes`, conformément au contrat `RPL-IDE-001.3` de `FloatingPaneFrame`. Les commandes réancrer et fermer via le menu du volet doivent rester atteignables. Les modes mobile et tablette existants remplacent les volets desktop : à 768 et 390 px, conserver leur menu et le contenu du fichier, sans introduire de fenêtre flottante mobile.

## Reproduction

Projet synthétique local, fichier importé par l’API, ouverture dans l’IDE réel, scission et détachement depuis le menu. Les requêtes de runtime et de génération sont bloquées dans le navigateur ; aucun workspace utilisateur démarré. Mesures et captures conservées sous `/tmp/floating-viewport-evidence/`. Le premier outil de mesure attendait à tort le cadre absent en mode mobile et a expiré ; seule la seconde exécution mesurée constitue la contre-épreuve géométrique.

## Correctif et vérification

Bornes CSS dès l’affichage et lors des changements du canevas ; départ du geste depuis la géométrie réellement affichée. Deux fichiers produit uniquement, sans changement des menus mobile/tablette ni du moteur de disposition. Le test durable est rouge avant correction sur le confinement initial ; les parcours ciblés passent après correction. Voir le [rapport et ses limites](../reprise/2026-10-12-volet-flottant-viewport.md), les [mesures avant](../reprise/mesures/flottant-2026-10-12/avant.json) et [après](../reprise/mesures/flottant-2026-10-12/apres.json).

La restauration automatique de la sélection mobile reste [ouverte séparément](BUG-IDE-MOBILE-RETOUR-SELECTION-001.md). Le passage mobile vert atteste une réouverture explicite par Fichiers, pas la correction de cette restauration.
