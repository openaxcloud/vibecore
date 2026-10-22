# Listing runtime pendant une sauvegarde

Base : #768 `6fa009b9180f8add2e6a60e5e3be52e4155336e3`. Source compilée : `9375639bc092dcadfe665b28ac7d3cee51eef17d`, arbre `006c14cde898deb9cb5da08362d1f5573031f2ad`. Le seul fichier produit modifié est `app/lib/stores/files.ts`. Les preuves ajoutées ensuite ne modifient pas ce produit.

## Contre-épreuves et correction bornée

Un listing commencé après la publication optimiste du brouillon, mais avant la résolution de l’écriture, adopte l’ancien disque. La sauvegarde réussit ensuite et retire dirty ; une réconciliation suivante peut remettre l’ancien cache dans le document. Le test rouge conserve cet ordre et vérifie aussi que le disque synthétique contient le nouveau texte. Il ne démontre pas une perte disque réelle ni un remplacement immédiat à l’écran au seul retrait de dirty.

`reloadFromRuntime` conserve désormais les chemins dont une sauvegarde de la même liaison est en vol au départ ou à l’arrivée du listing. La protection prend fin avec la sauvegarde ; une lecture externe ultérieure du même chemin reste adoptée. Aucun contenu n’est republié aveuglément en fin d’écriture. Le listing vérifie aussi sa liaison runtime.

Une seconde contre-épreuve a confirmé qu’une sauvegarde B au même chemin attendait la promesse A après rebind. Le chaînage est désormais limité à la même liaison ; le `finally` de A ne supprime pas la nouvelle queue B. Erreurs, sérialisation intra-projet et contre-cas de rebind sont conservés. Aucun changement Workbench/EditorStore, aucun délai, retry ou assertion affaibli.

## Validations et limites

- 66 tests ciblés passent dans cinq fichiers, sans omission. Le reçu historique de l’agent porte sur 58 tests dans quatre fichiers ; la combinaison finale ajoute les contrôles runtime-listing-save.
- Typage complet, lint (0 erreur, 52 avertissements existants), scan du commit et build passent. Les lanceurs Husky manquants du nouveau worktree ont été rétablis avant publication et les contrôles complets exécutés explicitement ; le commit documentaire utilise les hooks normaux.
- Suite générale finale : **10 041 succès, 7 omissions existantes, 0 échec ; 1 301 fichiers réussis, 2 omis**, en 299,18 s. Ce n’est pas un premier passage entièrement vert : erreurs de préparation initiales et erreur de collecte Sass du premier passage stabilisé sont conservées dans `preparation-failures.json`. Le fichier Sass isolé passe six assertions, puis la suite complète repasse sans modification. L’intermittence IPC n’est pas déclarée corrigée.
- Un parcours navigateur Chromium système passe directement en 15,6 s (17,3 s global), sans retry ni omission : ouvrir les fichiers, éditer, revenir, épingler et revenir à l’onglet. Application compilée locale sur 5232, vraie API locale sur 3018 avec PostgreSQL dédié et fixtures synthétiques. La recette suivie bloque les appels runtime distants, WebSockets et écritures HTTP des fichiers ; elle ne certifie pas la persistance runtime. Les captures illustrent deux étapes de ce parcours, pas une comparaison avant/après du défaut de sauvegarde.
- 9 481 blobs sources comparés sans différence, 2 306 fichiers compilés ; asset servi identique au fichier compilé. Manifestes complets joints, archive binaire conservée localement uniquement, empreinte dans `build-receipt.json`.

La causalité du flaky CI d’identité d’onglet reste ouverte. Le défaut unitaire est établi ; les événements watcher anciens sans version sont une hypothèse distincte non corrigée ici. Aucun panneau complet ni projet utilisateur réel n’est certifié.

## Reproduction

`pnpm exec vitest run app/lib/stores/files.reload-content.spec.ts app/lib/stores/workbench.project-storage-return.spec.ts app/lib/stores/files.create-empty-save.spec.ts app/lib/stores/workbench.runtime-listing-save.spec.ts app/lib/stores/files.stale-buffer-overwrite.spec.ts`

Suite complète : `pnpm exec vitest run`. Build : `pnpm run build`. Configuration navigateur exacte : `browser-configuration.txt`, qui hérite du `playwright.config.ts` suivi sans changer ses budgets. Les reçus rouges ciblés indiquent les cas exclus par filtre, pas des exemptions de tests.

## Intégration et confidentialité

Le lot reste séparé des têtes revues #768/#769/#770/#771. Une combinaison synthétique avec #771 conserve automatiquement le produit, mais présente des conflits documentaires et d’ajouts dans `workbench.project-storage-return.spec.ts` : réunir tous les scénarios et régénérer l’inventaire lors de l’intégration coordonnée. Les validations des branches empilées ne remplacent pas les gates filtrés sur main.

Seuls chemins relatifs/empreintes, compteurs, configuration de recette et captures de fixtures synthétiques sont joints. Aucun token, cookie, compte réel, trace brute ou archive compilée n’est publié. Les journaux initiaux restent conservés localement et leurs empreintes figurent dans les reçus.
