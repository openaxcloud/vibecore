---
id: BUG-AGENT-MODEL-SUBPANEL-HEIGHT-20261027
---

## Bug

Le sous-menu modèle desktop dépasse le bas de la fenêtre : à1440×900, top412.75px et hauteur493.34375px donnent bottom906.09375px. Reproduit avec le même rectangle sur le build livré #819 et sur le premier build du présent lot. La hauteur maximale CSS se fondait sur toute la fenêtre sans retrancher la position du panneau. Défaut préexistant, distinct d’Escape.

## 📤 Dispatché

☑ 27/10/2026 — correction locale de la hauteur disponible, sans refonte de navigation ou styles globaux.

## 💻 Codé

☐ main — correctif local dans FeuilleDesModes ; borne calculée depuis le top et la marge existante, défilement conservé.

## ✅ Testé live

☐ production — recette locale finale réussie, dont zoom200%, accès après défilement et bornes1px ; aucune recette production du correctif.

## Preuves

[Reproductions, validation et limites](ui-agent-followup-2026-10-27/README.md).
