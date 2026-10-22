# Complétions de création/suppression après navigation

Lot séparé sur #770, base `6a2505b596ae46a3d98586054c8940fae1a70220`. Aucun changement des têtes #768/#769/#770.

## Défaut et correction bornée

Une opération partie dans A pouvait terminer après le passage à B et y modifier fichiers, compteur, contenu modifié, tombstones, sélection et brouillons. La liaison runtime et la génération de projet sont maintenant vérifiées après la réponse, avant ces mutations locales. Le résultat original n’est pas falsifié : une réussite backend reste `true`, un rejet reste rejeté. Aucun changement d’autorisation, de route backend, de verrou ni de délai/retry.

Contre-épreuve **unitaire** : 34 contrôles existants réussissent et sept nouveaux cas échouent sur la base ; les mêmes 41 cas passent après correction. Avec les contrôles supplémentaires, 50 tests passent : création texte/binaire/dossier, suppression fichier/dossier, tombstones, même projet, changement de runtime, erreur tardive et verrou. Ces tests emploient un runtime synthétique différé. Ils ne valident pas une action réelle de persistance.

## Limite de recette réelle

Le harness local interdit les accès externes et n’a pas de WORKSPACE_MANAGER_URL configuré. L’API utilise alors le gestionnaire local par défaut `127.0.0.1:3010`. La sonde réelle GET `/health` échoue par connexion refusée (curl7/HTTP000). Créer/supprimer via les routes runtime nécessite un workspace attaché ; l’import ZIP n’est pas une validation de ces opérations et n’a pas été substitué.

Aucune recette UI de succès runtime tardif, aucune persistance fournisseur ni production n’est donc certifiée. Les chaînes rename/duplicate/upload qui peuvent démarrer une seconde opération après navigation restent hors de ce correctif de complétion. Ce lot ne revendique pas une isolation complète.

Les journaux bruts sont conservés localement ; seuls compteurs, empreintes et limites sont joints. Build, typage et suite complète doivent encore être validés avant publication.
