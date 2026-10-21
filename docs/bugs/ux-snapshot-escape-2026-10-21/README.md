# Confirmation : Escape après réouverture

Branche séparée issue de #758 `736ed190d64a980471e5943cf7e0695195f2a691`. Aucun changement de sa tête, aucune fusion. La recette utilise PostgreSQL et l’API locaux autorisés, avec de nouveaux comptes/projets synthétiques et aucun fournisseur externe. Aucun accès production.

## Rouge conservé

[Échec CI](ci-failure.txt) du job [119297534323](https://github.com/openaxcloud/vibecore/actions/runs/39621906313/job/119297534323), #759 : Escape après réouverture FR, dialogue encore visible après 5 secondes ; retry réussi. Aucun quota établi comme cause.

Le test FR inchangé passe d’abord 10/10 en local, sans retry. La répétition réduite reproduit ensuite le défaut sur le build commun avant correction : [72 réussites puis échec avec instrumentation](before-instrumented-results.json), [21 réussites puis échec sans instrumentation](before-native-results.json). [Événements](before-events.json), [focus sans instrumentation](before-native-focus.json), [capture rouge](before-native.png). Le bouton Annuler est focalisé, le dialogue est open, Escape parvient aux écouteurs sans être consommé ; aucune restauration n’est demandée.

La cause observable est une touche reçue par la confirmation visible/focalisée mais non prise en charge lors d’une réouverture. Le code Radix traite Escape selon l’index de couche, enregistré et actualisé après montage. Cela explique plausiblement la fenêtre temporelle, mais aucune inspection de cet état interne dans le runner CI n’est revendiquée.

## Correctif ciblé

Seul fichier produit modifié : `app/components/ui/Dialog.tsx`. La confirmation traite l’événement clavier arrivé sur son propre contenu lorsque Escape n’est pas déjà consommé. Elle respecte defaultPrevented et exclut les événements provenant d’un dialogue imbriqué. Aucun gestionnaire global supplémentaire, aucune modification du quota ou des délais. Les autres variantes de Dialog ne reçoivent pas ce traitement.

Le test existant conserve ses assertions et budgets, avec vingt réouvertures successives. Vérifications : fermeture, focus sur le bouton déclencheur, zéro appel de restauration, formulaire actif et absence de débordement. Aucun force-click, délai fixe ou retry ajouté.

## Première validation corrigée

[100/100 sans instrumentation](after-native-results.json), zéro restauration. [Capture après](after-native.png) : dialogue fermé et focus visible sur Restaurer. Scripts exacts [instrumenté](escape-probe.cjs), [natif avant](escape-probe-native.cjs), [natif après](escape-probe-after.cjs), à lancer depuis le checkout contenant les dépendances. Ils réutilisent l’API locale 3016 ; avant sur 5209, après sur 5210. Les identités sont synthétiques, la base n’est pas supprimée.

[Reçu du build corrigé](build-receipt.json) : arbre source `86d3929862d70fdf248a34cd47be59edf4566a91`, base #758 et seules différences produit/test explicites. L’empreinte du manifeste des 2 306 fichiers compilés est distincte d’une empreinte d’archive. Le build précédent est celui attesté dans la recette commune, conservé intact sur 5209. La preuve est locale, pas une certification CI ou production.

## Résultats complémentaires

- [Standard avant](before-standard-summary.json) : 10/10 FR inchangés, sans retry/omission.
- [Standard corrigé](after-standard-summary.json) : 10/10 (FR/EN répétés cinq fois), 200 réouvertures, zéro retry/omission.
- [Trois formats corrigés](after-formats-summary.json) : 6/6, clavier et tactile, FR/EN, 120 réouvertures, zéro retry/omission.
- Avec la sonde corrigée, total de 420 ouvertures/Escape réussies après correction, en plus des annulations par Enter/tap.
- Trois tests de composants utilisent les vrais composants Radix, sans remplacement : fermeture unique, Escape déjà consommé, fermeture du seul enfant imbriqué. Ils complètent les gestes navigateur réels sans les remplacer.

Commandes : `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5210 SAAS_API_URL=http://127.0.0.1:3016 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium UX_STANDARD_CONFIG=1 UX_INTEGRATION_REPORT_DIR=/tmp/escape-standard node_modules/.bin/playwright test -c playwright.combined-ux-audit.config.ts snapshot-cancel-focus.spec.ts --project chromium --repeat-each=5 --workers=1`. Pour les trois formats, omettre UX_STANDARD_CONFIG, --project et --repeat-each, avec un autre répertoire de résultats. Aucun changement de configuration des délais ou des retries.

Le premier contrôle d’inventaire a détecté le frontmatter manquant de la nouvelle fiche de bug ; l’en-tête a été ajouté et l’index régénéré (463 entrées). Le test du dialogue ajouté après compilation ne modifie pas les sources exécutées ; son empreinte est indiquée dans le reçu. Les hooks et la CI de la nouvelle PR restent distincts des recettes navigateur.


Après recette, le hook a demandé uniquement des retouches de style dans Dialog.tsx : déstructuration multiligne, ligne vide et commentaire de bloc. [Diff exact](format-only.patch). Le reçu conserve les empreintes avant/après et vérifie que leur JavaScript normalisé par esbuild est identique. Le build archivé précède ces retouches, explicitement sans changement de logique ; les derniers contrôles de typage/lint portent sur le texte final. Aucun rouge de recette supprimé.
