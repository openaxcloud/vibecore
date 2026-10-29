---
id: BUG-EXPLICIT-BUDGET-VISIBILITY-20261029
---

# BUG-EXPLICIT-BUDGET-VISIBILITY-20261029 — Réservations du projet invisibles

## Constat

La recette Aster ne peut pas vérifier le solde de réservation dans le sélecteur de modèle. Le GET `agent/explicit-run` ne renvoie que `bounded`. Le plafond explicite de 20 USD cumule atomiquement les réservations explicites, mais ne soustrait pas les anciens appels Auto/Anthropic. Les coûts enregistrés et les appels fournisseur ne constituent pas un journal comptable complet : ne jamais assimiler une entrée manquante à zéro.

## Correction préparée

GET distinct `agent/explicit-budget`, autorisé pour le projet, sans mutation et sans cache partagé : limite, réservé, restant, nombre de runs explicites. Validation de l'état persistant ; corruption ou panne renvoie indisponible. Aucun permis, identifiant de run ou secret exposé. La lecture BFF filtre les champs et conserve les erreurs génériques.

Le sélecteur de modèle affiche cet instantané, permet une actualisation et borne la lecture à dix secondes. Changement de projet et démontage annulent la requête ; une réponse tardive ne peut pas afficher le solde d'un autre projet. La lecture ne réserve rien et ne contacte aucun fournisseur.

## Limite maintenue

`historicalCostsIncluded:false`, `totalRecipeRemainingMicros:null`. Le reste de l'enveloppe explicite n'est PAS le reste du budget total autorisé pour la recette. Une réservation de 15,26 USD laisse 4,74 USD dans l'enveloppe explicite seulement. Ni un état absent ni un historique d'usage vide ne prouvent une dépense historique nulle. Aucun appel réel autorisé par cet affichage ; aucune réinitialisation du ledger, nouvelle clé, recharge ou modification de facturation.

## Validation

Tests synthétiques de projection BFF, état indisponible, changement de projet, délai et actualisation ; tests API d'autorisation, corruption et lecture après réservation. Pas de nouvelle recette production, aucun appel fournisseur. Publication, CI et livraison de ce correctif restent à effectuer après coordination.
