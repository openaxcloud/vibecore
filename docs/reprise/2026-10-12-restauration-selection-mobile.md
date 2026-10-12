# Restauration de la sélection mobile — 12 octobre 2026

Branche de travail : `codex/mobile-selection-restore-20261012`, base exacte `dfd1d1f071a2e19a516833e8fff491fb5a818bd0`. Travail distinct de la PR #731 ; aucun changement de sa branche. Correctifs validés localement, non publiés et non fusionnés ; contre-épreuves supplémentaires réalisées après le diagnostic CI de #731. La fiche `BUG-IDE-MOBILE-RETOUR-SELECTION-001` et les preuves historiques restent dans #731 ; cette note ne ferme pas la fiche.

## Deux mécanismes distincts

**Retour avec sélection absente.** Reproduit sur la base à 768 et 390 px : fichier `audit.txt` ouvert et sélection effectivement persistée, langue française, tableau de bord puis Retour navigateur. La carte des fichiers devient vide et l'éditeur affiche « Aucun fichier sélectionné » après 10 secondes. La trace d'observation confirme : `configureRuntime` vide la carte, le provider efface la sélection, puis trois appels à `loadProjectStorageFiles` renvoient `true` avec une carte toujours vide. Le cache de 30 secondes conserve le booléen d'une hydratation antérieure, sans rejouer ses effets. [Chronologie](mesures/selection-mobile-2026-10-12/cause-archives.json), [capture 768](captures/selection-mobile-2026-10-12/avant-retour-768.png), [capture 390](captures/selection-mobile-2026-10-12/avant-retour-390.png).

Le correctif retire ce délai de conservation pour le seul chargeur d'archives. La déduplication des appels simultanés et les gardes de projet restent actives. Aucune archive périmée n'est réappliquée depuis un nouveau cache.

**Navigation immédiate avec ancien fichier sélectionné.** Reproduit séparément aux deux largeurs, après le correctif précédent : `other.txt` est effectivement persisté, l'utilisateur choisit `audit.txt` puis recharge immédiatement avec `?lang=fr`. Après 10 secondes, l'éditeur affiche toujours `SECOND-DOCUMENT`. La sauvegarde UI de BaseChat attend 1 seconde ; la navigation annule ce délai avant que la nouvelle sélection atteigne la mémoire locale. Le correctif persiste immédiatement le seul chemin sélectionné après restauration du contexte projet/workspace. La couche de mémoire conserve son regroupement réseau de 1,5 seconde ; la disposition, le curseur et le défilement gardent leur délai existant.

La garde du nouvel effet exige le projet ET le workspace dont la restauration a réussi : une readiness héritée du projet précédent ou le simple fallback de 6 secondes ne suffit pas. Une sélection momentanément absente n'est pas enregistrée par ce nouvel effet.

La variante historique README n'est pas confondue avec la sélection absente : dans la trace 390 px de #731, le GET de mémoire à 21:42:00.408 UTC ne contient pas de `ui.selectedFile`, puis un PUT à 21:42:03.891 UTC porte `/home/project/README.md`. Cela est compatible avec un repli faute de sélection sauvegardée ; cette trace historique ne contient pas le relevé local synchrone nécessaire à une attribution exhaustive. La contre-épreuve nouvelle utilise volontairement un autre fichier identifiable.

## Interruption pendant l’hydratation

La contre-épreuve supplémentaire quitte l’IDE pendant qu’une réponse d’archive réelle est retenue, puis revient après sa libération. Elle a d’abord échoué : README était affiché. Relevés : mémoire `audit.txt` sur le tableau de bord initial puis pendant l’attente, champ absent après l’interruption (~2 secondes plus tard), toujours absent lors de la libération. Le délai de sauvegarde UI avait enregistré `selectedFile: undefined` alors que `pendingProjectSelectedFile` attendait encore les fichiers.

Le premier correctif conservait `selectedFile ?? pendingProjectSelectedFile.current`. Les contre-épreuves ci-dessous ont ensuite démontré que le chemin différé doit garder la priorité sur un repli temporaire ; un choix explicite de fichier disponible annule cette attente. Ce changement ne restaure aucun contenu de fichier et n’invente aucun repli README. Le test d’interruption conserve son assertion initiale.

## Validation

- Base exacte : deux échecs navigateur sur Retour, à 768 et 390 ; captures inspectées. Trace d'instrumentation séparée confirmant le faux succès du chargeur.
- Code d'origine réintroduit temporairement : trois des cinq nouvelles contre-épreuves unitaires échouent ; correctif restauré ensuite.
- Premier correctif : deux parcours complets langue / Retour / Suivant / rechargement passent en 21,8 et 21,3 secondes. Captures inspectées : [768](captures/selection-mobile-2026-10-12/apres-archives-retour-768.png), [390](captures/selection-mobile-2026-10-12/apres-archives-retour-390.png).
- Deux échecs indépendants sur sélection puis changement de langue immédiat, avant le second correctif.
- 47 tests ciblés passent : vrais stores fichiers/éditeur, concurrence, archive vide, erreur HTTP puis reprise, réponse tardive interprojet, conservation d'un brouillon pendant réhydratation, mémoire locale et regroupement réseau.
- Première version : 12/12 passages navigateur réussis (six scénarios répétés deux fois, un worker, zéro retry, 2,9 minutes), dont interruption et transition A → B. Journal : `/tmp/mobile-selection-evidence/repeated.log`.
- Sept gardes AST BaseChat réussies, distinctes des 47 tests ciblés. Typecheck global, contrôle strict du nouveau test E2E, lint, formatage et build final réussis. `BaseChat.tsx` garde la limite de typage décrite ci-dessous.
- Les sept captures finales de ces répétitions ont été inspectées ; elles restent dans `/tmp/mobile-selection-evidence/repeated`. Les captures antérieures liées ci-dessus ont aussi été inspectées.

Les premiers essais de harnais interrompus (ancien serveur encore présent, puis URL forçant le panneau Bibliothèque) ne comptent pas comme preuves du défaut. Les reproductions retenues sont sous `/tmp/mobile-selection-evidence/base-corrected`, `/tmp/mobile-selection-evidence/trace-nav` et `/tmp/mobile-selection-evidence/immediate`.

## Limites

Chromium local à largeurs 768/390, sans émulation tactile native ; aucune certification production. Fichiers importés dans des projets synthétiques locaux, appels runtime/chat bloqués et écritures fichiers navigateur bloquées. Aucun appel d'inférence, démarrage de workspace utilisateur, Save, preview distante, génération ou publication validé par ce travail.

Le test de brouillon couvre une nouvelle hydratation dans le même montage, avec le fichier toujours présent dans l'archive. Il ne prouve ni la persistance du contenu non sauvegardé après navigation/rechargement, ni sa conservation si le fichier disparaît de l'archive. Les resets au démontage perdent les brouillons dans les mesures avant/après ci-dessous. La variante README temporaire fait maintenant l'objet d'une contre-épreuve dédiée. La validité du chemin différé demeure celle du mécanisme existant. Après échec de restauration, la persistance immédiate reste désactivée et le mécanisme différé existant demeure.

Le nouveau test A → B retient une réponse GET réelle de A, navigue vers B dans le même document, libère A puis vérifie aussi les chemins des PUT vers B. Il ne couvre pas toutes les combinaisons de requêtes concurrentes. `BaseChat.tsx` conserve son `@ts-nocheck` préexistant : le typecheck global ne certifie pas ce fichier. Les contrôles AST, le build et les parcours navigateur apportent une validation distincte.

Relecture indépendante : correction du cache approuvée ; effet de sélection revu puis borné par le contexte restauré à la suite d'une réserve sur les transitions interprojets. Aucun push avant relecture du parent et livraison de #731.


## Contre-épreuves supplémentaires — risque des nouvelles hydratations

Deux défauts supplémentaires ont été démontrés sur `9fd22be0` avant correction :

- Une archive retenue peut remplacer le contenu fraîchement sauvegardé après rattachement du runtime. Le test utilise les vrais stores fichier/éditeur et un adaptateur runtime de test ; il échoue avec le contenu ancien puis passe après protection des chemins dont la sauvegarde a réussi. Les sauvegardes avant requête, le fichier volontairement vide, la suppression pendant attente et les placeholders de listing sans contenu sont distingués. Les réponses d'un ancien rattachement sont rejetées et ne partagent plus le vol du nouveau rattachement.
- Quand l'archive réelle d'un projet synthétique ne contient momentanément plus `audit.txt`, README apparaît et écrase le chemin différé dans la mémoire. Les deux parcours navigateur échouent avant correction. La priorité au chemin différé corrige le repli ; une contre-épreuve avec choix volontaire de `other.txt` a ensuite révélé que l'attente empêchait ce nouveau choix d'être enregistré. Le choix explicite d'un fichier disponible annule maintenant l'attente, dans `openProjectFile` et dans le callback de l'arbre Workbench. Aucun contenu ni composition du menu mobile n'est modifié.

Les tests de conversation achevée exécutent les deux ordres : archive puis transcription, transcription puis archive. Les actions historiques marquées hydratées ne remplacent pas le contenu sauvegardé par l'ancien texte et n'écrivent ni runtime ni ZIP. Il s'agit de tests de stores, sans génération réelle. Un test distinct vérifie que la protection d'un chemin sauvegardé dans A ne se propage pas à B.

### Brouillons : perte préexistante, pas une promesse de conservation

La caractérisation du reset des documents passe également avec `workbench.ts` et `files.ts` remis temporairement à la base `dfd1d1f0` : le brouillon disparaît dès le rattachement, avant application de l'archive. La sonde navigateur sur `9fd22be0` ne récupère le brouillon dans aucun des trois parcours langue/rechargement/Retour-Suivant ; la version corrigée retrouve le contenu sauvegardé, sans le brouillon, dans les trois parcours. Les deux premières observations anciennes étaient prises pendant la sélection vide transitoire ; l'itération suivante vérifiait le retour du contenu original. La sonde après correction attend l'éditeur visible, donc ces instantanés ne comparent pas une durée de sélection vide.

Les écritures de fichiers navigateur et appels runtime/chat sont bloqués dans cette sonde ; elle caractérise un brouillon dont l'autosauvegarde échoue, et ne valide pas un Save réel. La sonde exploratoire reste hors de la suite E2E permanente. Logs locaux : `draft-base.log`, `draft-before-result.log`, `draft-after.log` sous `/tmp/mobile-selection-evidence`.

### Bornes de la correction

La protection des chemins sauvegardés dure jusqu'au changement de projet/runtime ; elle privilégie le fichier courant sans comparer les versions d'une archive ultérieure ou d'un éditeur externe. Les chemins explicites vérifiés sont ceux de `openProjectFile` et de l'arbre Workbench ; les autres écritures directes du store ne sont pas universellement couvertes. Le correctif ne garantit pas la conservation d'un brouillon après démontage.

### Validation supplémentaire finale

104 tests ciblés réussis (11 fichiers, dont 15 contre-épreuves archive/runtime et les gardes AST), typecheck global et E2E strict, lint, formatage et build réussis. Les deux parcours README passent sur le dernier build sans retry ; captures inspectées : [attente audit](captures/selection-mobile-2026-10-12/apres-readme-attente-audit-390.png), [choix explicite](captures/selection-mobile-2026-10-12/apres-readme-choix-explicite-390.png). La répétition globale du dernier delta réussit : **18/18 passages**, neuf scénarios répétés deux fois, un worker, zéro retry, 8 minutes (`/tmp/mobile-selection-evidence/repeated-final.log`). Elle inclut interruption, réponse GET tardive A → B et les deux variantes README. Les captures de rechargement à 768/390, interruption et deux variantes README du premier tour ont été inspectées ; au second tour, interruption et deux variantes README ont également été inspectées. Toutes les destinations navigateur autres que localhost sont bloquées par le harnais avant émission. Aucun push.
