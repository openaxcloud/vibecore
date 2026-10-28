---
id: BUG-AGENT-TOOLS-ESCAPE-20261028
---

## Bug

Le menu outils du compositeur Agent ouvert au pointeur reste ouvert après Escape : le raccourci global consomme l’événement lorsque le focus reste sur son déclencheur.

## 📤 Dispatché

☑ 28/10/2026 — reproduction Chromium local sur quatre formats.

## 💻 Codé

☐ main — correctif local séparé de #838 en validation, aucune fusion ni livraison.

## ✅ Testé live

☐ production — recette locale compilée synthétique uniquement.

## Correction et preuve

L’ancre existante porte un propriétaire Escape uniquement pendant l’ouverture du menu. Le gestionnaire global cède cet événement au menu, sans modifier Ctrl+S ni Escape après fermeture. Aucun changement de DOM structurel, délai, navigation ou assertion assouplie.

[Test intégré rouge/vert et quatre recettes compilées](ui-agent-tools-escape-evidence-20261028/README.md) : 16 tests réussis ; 390/820/1280/1536 réussis, focus et brouillon conservés. Build, typage web et lint ciblé réussis. Les API/runtime sont synthétiques et aucune requête de génération n’est envoyée. Pas de certification Safari, zoom200% ou appareil réel.
