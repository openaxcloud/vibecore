---
id: BUG-IDE-EXECUTION-FALSE-SUCCESS-001
---

# Terminal, Workflows et Security : résultat d’exécution distinct du succès HTTP

## 📤 Dispatché

23 octobre 2026, lot fonctionnel borné sur main `05636a95f7c33b0c6fc90fe54484564d981fec27`. Aucun contenu #768/#764, changement d’accès ou commande sur un projet utilisateur.

## 💻 Codé

Le BFF conserve les enregistrements avant de répondre et retourne le run/scan : succès HTTP 200 / ok:true seulement pour succeeded/completed ; échec d’exécution HTTP 422 / ok:false avec message FR/EN. Terminal et Workflows conservent leurs sorties/logs. Security agrège le statut des sous-commandes, conserve leurs codes de sortie et ne supprime pas les constats précédents sur un scan incomplet. Les commandes/règles de détection ne changent pas.

L’UI traite ok:false et le statut du scan, recharge l’historique d’échec sans afficher une réussite, et ne remplace pas un timeout/une annulation par completed sur une réponse tardive. Correctif non intégré/déployé.

## ✅ Testé live

Contre-épreuve locale réelle sur le build main : Terminal (`exit 7`, fixture créée pour la recette) et workflow synthétique retournent HTTP 200 / ok:true alors que leurs enregistrements PostgreSQL sont failed. Le scan Security local exécuté est completed : il ne constitue pas une preuve réelle d’un scan failed. Cas failed/timeout et sous-scans échoués reproduits par tests de contrat à exécuteur contrôlé ; onze assertions rouges avant correctif, puis vertes.

Contre-épreuve UI séparée et explicitement contrôlée : une réponse HTTP 200 / ok:false / scan.status=failed produit à tort data-status=completed. Les fixtures, réponses contrôlées et preuves runtime réelles doivent rester distinguées. Rapport final et limites joints au lot ; aucune certification production ou scanner complet.

[Recette finale et limites](panel-outcomes-2026-10-23/README.md) : 56 tests ciblés verts ; navigateur cinq succès initiaux puis reprise ciblée Workflows réussie après correction d’un sélecteur ambigu. Build final réussi ; preuves runtime réelles distinctes des tests UI contrôlés. CI et revue requises avant toute intégration.
