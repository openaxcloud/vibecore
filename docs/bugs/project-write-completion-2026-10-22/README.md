# Complétions de création/suppression après navigation

Lot séparé sur #770, base `6a2505b596ae46a3d98586054c8940fae1a70220`. Aucun changement des têtes #768/#769/#770.

## Défaut et correction bornée

Une opération partie dans A pouvait terminer après le passage à B et y modifier fichiers, compteur, contenu modifié, tombstones, sélection et brouillons. La liaison runtime et la génération de projet sont maintenant vérifiées après la réponse, avant ces mutations locales. Le résultat original n’est pas falsifié : une réussite backend reste `true`, un rejet reste rejeté. Aucun changement d’autorisation, de route backend, de verrou ni de délai/retry.

Contre-épreuve **unitaire** : 34 contrôles existants réussissent et sept nouveaux cas échouent sur la base ; les mêmes 41 cas passent après correction. Avec les contrôles supplémentaires, 50 tests passent : création texte/binaire/dossier, suppression fichier/dossier, tombstones, même projet, changement de runtime, erreur tardive et verrou. Ces tests emploient un runtime synthétique différé. Ils ne valident pas une action réelle de persistance.

## Limite de recette réelle

Le harness local interdit les accès externes et n’a pas de WORKSPACE_MANAGER_URL configuré. L’API utilise alors le gestionnaire local par défaut `127.0.0.1:3010`. La sonde réelle GET `/health` échoue par connexion refusée (curl7/HTTP000). Créer/supprimer via les routes runtime nécessite un workspace attaché ; l’import ZIP n’est pas une validation de ces opérations et n’a pas été substitué.

Aucune recette UI de succès runtime tardif, aucune persistance fournisseur ni production n’est donc certifiée. Les chaînes rename/duplicate/upload qui peuvent démarrer une seconde opération après navigation restent hors de ce correctif de complétion. Ce lot ne revendique pas une isolation complète.

Les journaux bruts sont conservés localement ; seuls compteurs, empreintes et limites sont joints. Le build, le typage, le lint (zéro erreur, 52 avertissements existants) et gitleaks passent sur le commit produit `26f7441685ebea6bc8cb666a1fdda8e648ce4872`, arbre `15ffadab688af48838e0da3f9b48b701ade03b19`. La suite complète passe au premier essai : 10 039 tests réussis et sept omissions existantes, 1 301 fichiers réussis et deux omis, en 294,56 s. Les 50 tests ciblés repassent après formatage. L’attestation compare 9 483 sources sans différence et recense 2 306 fichiers compilés ; aucun test navigateur de mutation runtime n’est revendiqué. Les preuves documentaires suivantes ne modifient pas le produit compilé.

## Matrice bornée

| Cas | Preuve disponible | Limite |
| --- | --- | --- |
| Création texte/binaire/dossier A puis passage B | Rouge puis vert unitaires, réponse différée | Runtime synthétique |
| Suppression fichier/dossier A puis passage B | Rouge puis vert unitaires, tombstones et état B contrôlés | Runtime synthétique |
| Même projet, nouveau runtime, erreur tardive, verrou | Contrôles unitaires verts | Pas de persistance fournisseur |
| Succès réel après navigation via runtime local | Bloqué : manager local inaccessible | Non testé en navigateur |
| Renommage/duplication/upload multi-opérations | Hors de ce lot | Non certifié |

Reproduction unitaire : `pnpm exec vitest run app/lib/stores/files.create-empty-save.spec.ts app/lib/stores/workbench.project-storage-return.spec.ts`. Suite complète : `pnpm exec vitest run`. Build : `pnpm run build`. Aucun délai, retry, seuil ou exemption de test n’est ajouté.

## Complément : URL changée avant rebascule du store

La première garde de génération ne couvrait pas la fenêtre où l’URL passe à B avant l’effet `configureProject(B)`. Une suppression A terminée dans cet intervalle écrasait la clé de tombstones B ; une création pouvait également changer sélection et état modifié. Une sonde unitaire ciblée reproduit le tombstone erroné. La matrice corrigée compte trois échecs produit et trois contrôles réussis sur la version intermédiaire ; une première matrice contenait une mauvaise propriété d’assertion (`content` au lieu de `value`), conservée comme erreur de préparation et non comptée comme preuve produit.

La complétion vérifie maintenant aussi le projet canonique issu de l’URL, dans FilesStore et les wrappers Workbench. Un changement de panneau du même projet reste valide. Les 57 tests ciblés passent après correction et formatage ; le build et la suite complète de ce nouveau delta sont à revalider. Les résultats 26f74416 ci-dessus restent historiques et ne sont pas appliqués à ce complément.
