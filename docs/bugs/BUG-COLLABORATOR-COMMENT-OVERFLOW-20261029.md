---
id: BUG-COLLABORATOR-COMMENT-OVERFLOW-20261029
---

## Bug

Un commentaire Collaborators avec URL longue force une largeur de2903–3382px dans un panneau de358–771px.

## 📤 Dispatché

☑ Diagnostic local29octobre, trois formats390/820/1280, données synthétiques.

## 💻 Codé

☐ main — règle locale overflow-wrap:anywhere sur les paragraphes de commentaires, aucun contenu tronqué. Tête840préservée.

## ✅ Testé live

☐ production — contrepreuveCSS3/3verte puis recette compilée390/820/1280 sans injectionCSS3/3verte. Build client/SSR et86tests CSS/inventaire réussis, revue indépendante favorable. Aucune invitation ni mutation de permission.

## Limites

Deux pertes initiales de brouillon restent inexpliquées ; aucun correctif revendiqué sur ce point. Preuves dans ui-collaborators-followup-evidence-20261029.
