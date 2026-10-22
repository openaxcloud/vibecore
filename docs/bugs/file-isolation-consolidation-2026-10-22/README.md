# Consolidation bornée : lectures, mutations tardives et sauvegardes

Base main `2828ba50713675273b09c87d94593dfe95273085`, après #773. Les seuls diffs propres de #770 `6a2505b5`, #771 `9a5d7f80` et #772 `a6123baa` sont appliqués. Aucune ascendance ni modification produit UX de #768 ; aucun changement du projet utilisateur.

## Delta et conflits

Trois chemins produit : `app/lib/stores/files.ts`, `app/lib/stores/workbench.ts`, `app/lib/runtime/ProjectWorkspaceProvider.tsx`. Isolation des lectures/documents par projet, gardes de complétion des mutations et du transfert URL, protection des sauvegardes contre les listings anciens, files de sauvegarde par destination stable.

Un seul conflit Git : ajouts adjacents dans `workbench.project-storage-return.spec.ts`, réunis sans retirer de scénario. L’index des bugs est régénéré à partir de toutes les fiches de main et des fiches ajoutées. BaseChat et les trois sources/tests clés de #773 sont identiques à main.

La combinaison brute perdait la destination d’écriture au reset `configureProject` ajouté par #770. Ce reset conserve désormais l’identité projet de #772, y compris A→B→A. Deux autres contre-épreuves confirment le résidu directement lié à #771 : après sélection d’un autre fichier pendant une suppression, l’ancienne sélection capturée avant await reprenait la main. Fichier et dossier consultent désormais la sélection à la complétion. Le repli vers un fichier survivant reste testé si la sélection supprimée est encore active.

## Validation ciblée

238 tests passent dans neuf fichiers, zéro omission. Ils couvrent les trois lots combinés, les deux interactions ajoutées, les gardes de reprise des actions et les régressions #773 conservées. Aucun seuil, assertion, retry ou délai assoupli. Le reçu conserve le rouge initial (trois échecs ciblés) et le premier passage combiné (237 succès, un échec).

Cet échec supplémentaire est une fuite de fixture : le test de refus d’écrasement d’un fichier verrouillé laissait son verrou synthétique actif pour le scénario de sauvegarde suivant. La paire seule reproduit l’échec. Le test libère maintenant son verrou dans finally ; toutes ses assertions et la logique produit de verrouillage sont intactes.

Les tests exécutent les stores et composants réels avec runtimes synthétiques : aucune persistance distante réelle ni certification de panneau complet. Pas de nouvelle suite locale générale ni de build. La CI obligatoire de la nouvelle tête reste requise ; les verts historiques ne la remplacent pas.

## Preuves réutilisées

Les grandes archives de preuves ne sont pas recopiées dans ce diff. Elles restent inchangées dans les commits sources et dans les checkouts locaux :

- [#770 : lectures/documents, captures et recettes](https://github.com/openaxcloud/vibecore/blob/6a2505b596ae46a3d98586054c8940fae1a70220/docs/bugs/project-file-scope-2026-10-22/README.md)
- [#771 : mutations, transfert URL et limites](https://github.com/openaxcloud/vibecore/blob/9a5d7f803eed0680684f32e0329cf4af50e261ac/docs/bugs/project-write-completion-2026-10-22/README.md)
- [#772 : sauvegardes, contre-épreuves P1 et limites](https://github.com/openaxcloud/vibecore/blob/a6123baae8338d4edd48c91ebdbc71e13da15897/docs/bugs/reload-during-save-2026-10-22/README.md)

[Provenance exacte, empreintes et compteurs](receipt.json). Les journaux bruts restent locaux ; aucun secret, compte réel ou contenu du projet utilisateur n’est joint. Les anciennes PR restent ouvertes pour vérification de la consolidation. Aucune fusion ni livraison autonome.
