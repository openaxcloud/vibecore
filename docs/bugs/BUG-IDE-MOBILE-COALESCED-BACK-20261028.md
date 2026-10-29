---
id: BUG-IDE-MOBILE-COALESCED-BACK-20261028
---

## Bug

Après Search → Agent → Retour rapide, le routeur revient à Search mais le panneau reste Agent : le champ existe, caché. Le changement optimiste de panneau persiste lorsque React ne commet pas la destination intermédiaire.

## 📤 Dispatché

☑ 28/10/2026 — diagnostic CI839, run40786536543/job123161204394, puis reproduction contrôlée locale.

## 💻 Codé

☐ main — correction locale validée, non livrée ; têtes838/839 préservées.

## ✅ Testé live

☐ production — recette Chromium synthétique, aucun projet client.

## Preuves et limites

CI : routeur idle, URL?panel=search, surfacechat, queryCount1/visibleQueryCount0. La reprise suivante passe ; cet incident reste déclaré.

Deux recettes locales reproduisent le désaccord avec retard borné du scheduler React puis libération. Le parcours normal clicAgent→attenteURL→goBack reproduit encore le défaut26s après libération. À délai0, contre-épreuve verte. Aucune modification de l’état produit ou de l’URL à la place des actions réelles. Diagnostic /workspace/ui839-search-diagnostic.

Une autre anomalie locale de sélection provenait d’une sonde appliquée à un nœud détaché ; elle ne prouve pas une perte produit et ne constitue pas la cause de ce défaut. Le retour interprojetB→A#834 reste distinct et non résolu.

## Correctif local validé

Compteur POP mobile/tablette, synchronisation sur la route courante exacte après navigation idle. Sept tests React, quatre recettes compilées390/768/390/820 avec retard borné puis libéré passent, zéro erreur JS. Build, typage complet, lint et revue indépendants passent. Preuves dans `ui-search-history-evidence-20261028`. Cette correction attend sa CI et sa livraison ; elle ne clôt pas #834.
