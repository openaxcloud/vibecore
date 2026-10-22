# Listing runtime pendant une sauvegarde

**Statut : les reçus et captures de ce dossier attestent la version historique `9375639bc` et sa publication documentaire `af4766e9`. Ils ne valident pas le correctif P1 actuel. Les fichiers de reçus restent inchangés.**

Base historique : #768 `6fa009b9180f8add2e6a60e5e3be52e4155336e3`. Source compilée : `9375639bc092dcadfe665b28ac7d3cee51eef17d`, arbre `006c14cde898deb9cb5da08362d1f5573031f2ad`. Le seul fichier produit modifié est `app/lib/stores/files.ts`. Les preuves ajoutées ensuite ne modifient pas ce produit.

## Historique 9375639b / af4766e9 — correction initiale, désormais insuffisante

Un listing commencé après la publication optimiste du brouillon, mais avant la résolution de l’écriture, adopte l’ancien disque. La sauvegarde réussit ensuite et retire dirty ; une réconciliation suivante peut remettre l’ancien cache dans le document. Le test rouge conserve cet ordre et vérifie aussi que le disque synthétique contient le nouveau texte. Il ne démontre pas une perte disque réelle ni un remplacement immédiat à l’écran au seul retrait de dirty.

Dans cette version historique, `reloadFromRuntime` conserve les chemins dont une sauvegarde de la même liaison est en vol au départ ou à l’arrivée du listing. La protection prend fin avec la sauvegarde ; une lecture externe ultérieure du même chemin reste adoptée. Aucun contenu n’est republié aveuglément en fin d’écriture. Le listing vérifie aussi sa liaison runtime.

Une seconde contre-épreuve a confirmé qu’une sauvegarde B au même chemin attendait la promesse A après rebind. Le chaînage de cette version historique était limité à la même liaison ; le `finally` de A ne supprime pas la nouvelle queue B. Erreurs, sérialisation intra-projet et contre-cas de rebind sont conservés. Aucun changement Workbench/EditorStore, aucun délai, retry ou assertion affaibli.

## Validations historiques et limites

- 66 tests ciblés passent dans cinq fichiers, sans omission. Le reçu historique de l’agent porte sur 58 tests dans quatre fichiers ; la combinaison finale ajoute les contrôles runtime-listing-save.
- Typage complet, lint (0 erreur, 52 avertissements existants), scan du commit et build passent. Les lanceurs Husky manquants du nouveau worktree ont été rétablis avant publication et les contrôles complets exécutés explicitement ; le commit documentaire utilise les hooks normaux.
- Suite générale finale : **10 041 succès, 7 omissions existantes, 0 échec ; 1 301 fichiers réussis, 2 omis**, en 299,18 s. Ce n’est pas un premier passage entièrement vert : erreurs de préparation initiales et erreur de collecte Sass du premier passage stabilisé sont conservées dans `preparation-failures.json`. Le fichier Sass isolé passe six assertions, puis la suite complète repasse sans modification. L’intermittence IPC n’est pas déclarée corrigée.
- Un parcours navigateur Chromium système passe directement en 15,6 s (17,3 s global), sans retry ni omission : ouvrir les fichiers, éditer, revenir, épingler et revenir à l’onglet. Application compilée locale sur 5232, vraie API locale sur 3018 avec PostgreSQL dédié et fixtures synthétiques. La recette suivie bloque les appels runtime distants, WebSockets et écritures HTTP des fichiers ; elle ne certifie pas la persistance runtime. Les captures illustrent deux étapes de ce parcours, pas une comparaison avant/après du défaut de sauvegarde.
- 9 481 blobs sources comparés sans différence, 2 306 fichiers compilés ; asset servi identique au fichier compilé. Manifestes complets joints, archive binaire conservée localement uniquement, empreinte dans `build-receipt.json`.

La causalité du flaky CI d’identité d’onglet reste ouverte. Le défaut unitaire est établi ; les événements watcher anciens sans version sont une hypothèse distincte non corrigée ici. Aucun panneau complet ni projet utilisateur réel n’est certifié.

## Reproduction historique

`pnpm exec vitest run app/lib/stores/files.reload-content.spec.ts app/lib/stores/workbench.project-storage-return.spec.ts app/lib/stores/files.create-empty-save.spec.ts app/lib/stores/workbench.runtime-listing-save.spec.ts app/lib/stores/files.stale-buffer-overwrite.spec.ts`

Suite complète : `pnpm exec vitest run`. Build : `pnpm run build`. Configuration navigateur exacte : `browser-configuration.txt`, qui hérite du `playwright.config.ts` suivi sans changer ses budgets. Les reçus rouges ciblés indiquent les cas exclus par filtre, pas des exemptions de tests.

## Intégration et confidentialité

Le lot reste séparé des têtes revues #768/#769/#770/#771. Une combinaison synthétique avec #771 conserve automatiquement le produit, mais présente des conflits documentaires et d’ajouts dans `workbench.project-storage-return.spec.ts` : réunir tous les scénarios et régénérer l’inventaire lors de l’intégration coordonnée. Les validations des branches empilées ne remplacent pas les gates filtrés sur main.

Seuls chemins relatifs/empreintes, compteurs, configuration de recette et captures de fixtures synthétiques sont joints. Aucun token, cookie, compte réel, trace brute ou archive compilée n’est publié. Les journaux initiaux restent conservés localement et leurs empreintes figurent dans les reçus.

## P1 actuel : destination d’écriture stable, liaison de lecture distincte

La contre-épreuve P1 réfute le chaînage limité à une liaison : un nouvel adaptateur peut viser le même projet et donc la même destination. Si une ancienne écriture est déjà partie, autoriser immédiatement la suivante permet à la première de terminer après elle et d’écraser son résultat. Une erreur de scope à la fin empêche une publication mémoire tardive, mais n’annule pas une écriture disque déjà envoyée.

Le correctif en cours conserve les files par destination et chemin. Le provider transmet explicitement `projectId` à `configureRuntime` ; pour un adaptateur distant, la destination est `remote-project:${projectId}`. Un nouveau workspace du même projet conserve cette destination ; un véritable projet B reçoit une autre file. A→B→A retrouve la file A encore en vol. Pour un runtime local ou une destination inconnue, le compartiment `undefined` conserve une sérialisation prudente. Le numéro de liaison runtime reste distinct : il invalide les lectures et publications d’un ancien adaptateur. Le nettoyage ne retire une promesse que si elle est encore la dernière de sa file.

Validation du P1 : **71 tests ciblés passent dans cinq fichiers, zéro omission**, après les corrections de mise en forme. La suite générale déjà engagée avant la réduction de périmètre est terminée : 10 046 succès, sept omissions, zéro échec (dont 16 tests dupliqués par le build local). Elle précède la mise en forme lint et n’a pas été relancée. Le typage complet passe ; les hooks du commit vérifient le typage et le lint de la tête finale. Le premier lint rouge (20 erreurs de mise en forme) est conservé par empreinte.

Le scénario distant confirme que B attend A puis refuse `REMOTE_FILE_CHANGED` sans écrire lorsque le disque a changé. Adaptateurs synthétiques uniquement : aucune persistance runtime réelle certifiée. Aucun nouveau build ou parcours navigateur local n’est lancé conformément à la réduction de périmètre ; les anciennes preuves compilées ne valident pas le nouveau P1. La CI et la revue indépendante de la nouvelle tête restent nécessaires. [Contre-épreuves](destination-p1/counterproofs.json) et [reçu avec empreintes des sources](destination-p1/validation.json).
