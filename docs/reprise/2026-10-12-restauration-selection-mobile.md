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

- Une archive retenue peut remplacer le contenu fraîchement sauvegardé après rattachement du runtime. Le test utilise les vrais stores fichier/éditeur et un adaptateur runtime de test ; il échoue avec le contenu ancien puis passe après protection des chemins dont la sauvegarde a réussi. Les sauvegardes concurrentes à la requête, le fichier volontairement vide, la suppression pendant attente et les placeholders de listing sans contenu sont distingués. Les réponses d'un ancien rattachement sont rejetées et ne partagent plus le vol du nouveau rattachement.
- Quand l'archive réelle d'un projet synthétique ne contient momentanément plus `audit.txt`, README apparaît et écrase le chemin différé dans la mémoire. Les deux parcours navigateur échouent avant correction. La priorité au chemin différé corrige le repli ; une contre-épreuve avec choix volontaire de `other.txt` a ensuite révélé que l'attente empêchait ce nouveau choix d'être enregistré. Le choix explicite d'un fichier disponible annule maintenant l'attente, dans `openProjectFile` et dans le callback de l'arbre Workbench. Aucun contenu ni composition du menu mobile n'est modifié.

Les tests de conversation achevée exécutent les deux ordres : archive puis transcription, transcription puis archive. Les actions historiques marquées hydratées ne remplacent pas le contenu sauvegardé par l'ancien texte et n'écrivent ni runtime ni ZIP. Il s'agit de tests de stores, sans génération réelle. Un test distinct vérifie que la protection d'un chemin sauvegardé dans A ne se propage pas à B.

### Brouillons : perte préexistante, pas une promesse de conservation

La caractérisation du reset des documents passe également avec `workbench.ts` et `files.ts` remis temporairement à la base `dfd1d1f0` : le brouillon disparaît dès le rattachement, avant application de l'archive. La sonde navigateur sur `9fd22be0` ne récupère le brouillon dans aucun des trois parcours langue/rechargement/Retour-Suivant ; la version corrigée retrouve le contenu sauvegardé, sans le brouillon, dans les trois parcours. Les deux premières observations anciennes étaient prises pendant la sélection vide transitoire ; l'itération suivante vérifiait le retour du contenu original. La sonde après correction attend l'éditeur visible, donc ces instantanés ne comparent pas une durée de sélection vide.

Les écritures de fichiers navigateur et appels runtime/chat sont bloqués dans cette sonde ; elle caractérise un brouillon dont l'autosauvegarde échoue, et ne valide pas un Save réel. La sonde exploratoire reste hors de la suite E2E permanente. Logs locaux : `draft-base.log`, `draft-before-result.log`, `draft-after.log` sous `/tmp/mobile-selection-evidence`.

### Bornes de la correction

La protection est limitée aux sauvegardes terminées pendant chaque requête d’archive : les numéros de sauvegarde par chemin sont copiés avant le fetch et comparés après décodage. Ils sont remis à zéro au changement de projet/runtime. Un rechargement explicite ultérieur adopte normalement la version externe ; aucune autorité permanente du contenu local ni comparaison de versions serveur n’est revendiquée. Les chemins explicites vérifiés sont ceux de `openProjectFile` et de l'arbre Workbench ; les autres écritures directes du store ne sont pas universellement couvertes. Le correctif ne garantit pas la conservation d'un brouillon après démontage.

### Validation supplémentaire finale

La première validation comptait 104 tests ciblés (11 fichiers, dont 15 contre-épreuves archive/runtime et les gardes AST), avec typecheck global et E2E strict, lint, formatage et build réussis. Attention : ces 104 tests précédaient le dernier callback Workbench ; le contrôle AST de ce callback a été repris ci-dessous. Les deux parcours README passent sur le dernier build sans retry ; captures inspectées : [attente audit](captures/selection-mobile-2026-10-12/apres-readme-attente-audit-390.png), [choix explicite](captures/selection-mobile-2026-10-12/apres-readme-choix-explicite-390.png). La répétition globale du dernier delta réussit : **18/18 passages**, neuf scénarios répétés deux fois, un worker, zéro retry, 8 minutes (`/tmp/mobile-selection-evidence/repeated-final.log`). Elle inclut interruption, réponse GET tardive A → B et les deux variantes README. Les captures de rechargement à 768/390, interruption et deux variantes README du premier tour ont été inspectées ; au second tour, interruption et deux variantes README ont également été inspectées. Toutes les destinations navigateur autres que localhost sont bloquées par le harnais avant émission. Aucun push.

## Révision après revue parent — protection limitée à la requête

La contre-épreuve demandée confirme le défaut de la protection permanente sur `8bd73e74b` : après sauvegarde locale réussie (texte ou vide), une modification externe ultérieure suivie d’un rechargement explicite reste masquée. Deux échecs rouges au niveau du contenu éditeur (`external-archive-red-final.log`). La première tentative de harnais lisait une clé runtime absolue au lieu de relative et ne compte pas comme preuve.

Le Set permanent est remplacé par des numéros de sauvegarde par chemin, comparés à leur copie prise au début de chaque requête. Une sauvegarde terminée durant la requête reste protégée, y compris une seconde sauvegarde du même chemin et un contenu vide. Une sauvegarde terminée avant la requête ne masque plus son archive. Les 105 tests ciblés passent sur 11 fichiers, dont 16 tests archive/runtime (`external-archive-final-tests.log`).

Le callback Workbench ajouté précédemment faisait diverger l’empreinte mobile gelée. Comparaison exacte contre main `dfd1d1f0`, confirmée indépendamment : un seul hunk de cinq lignes `onUserFileSelect`, sans texte, classe ou structure JSX modifié. L’empreinte est rescellée avec cette justification dans le test existant ; les sept gardes AST passent. Les 18 E2E documentés plus haut portent sur `8bd73e74b`, avant cette révision de concurrence. Aucun push mobile.

Contrôles de cette révision : typecheck web, lint, formatage et build passent. Trois parcours navigateur ciblés sur ce build : deux variantes README vertes (captures inspectées), interruption rouge sur l’attente URL `/dashboard` au second Retour pendant l’archive retenue, ligne 250. La capture après échec montre le Dashboard ; la dernière lecture d’URL consignée rapporte encore l’IDE ; le détail temporel est précisé ci-dessous. [Capture du rouge](captures/selection-mobile-2026-10-12/interruption-url-dashboard-2026-10-13.png). Deux répétitions isolées inchangées de l’interruption passent ensuite (49,5 s, un worker, zéro retry ; seconde capture inspectée). Ce rouge reste consigné et non attribué ; il interdit de présenter cette révision comme uniformément verte en navigateur. Aucun allongement de délai ni assertion modifiée. Journaux : `external-archive-browser.log`, `external-archive-interruption-repeat.log` sous `/tmp/mobile-selection-evidence`. Relecture indépendante favorable au code et à la comparaison d’empreinte. Aucun push mobile.

## Diagnostic du second Retour — 13 octobre 2026

Aucun changement produit après `7496ce62f`. Le défaut de lenteur reste **non attribué et non clôturé**. Les répétitions vertes ne neutralisent pas le rouge original.

### Historique attendu et observé

Le bouton `button-back` de BaseChat exécute `navigate('/dashboard')` : c’est une nouvelle entrée, pas un Retour navigateur. Après le premier clic, `page.goBack()` revient à l’entrée IDE précédente. Le second clic ajoute Dashboard et remplace la branche suivante de l’historique. Les observations instrumentées suivent exactement IDE (index 1) → Dashboard (index 2) → POP IDE (index 1) → Dashboard (index 2). La longueur reste 6 au second clic car l’entrée suivante est abandonnée puis remplacée. Le dernier Retour navigateur revient ensuite à IDE. Aucune dérive d’historique ni redirection HTTP après le premier Retour n’a été observée dans ces passages.

### Ce que montre réellement le rouge

Horloge monotone de la trace, en millisecondes :

| Observation | Instant |
| --- | ---: |
| Début du second clic Retour | 28190,602 |
| Requête Dashboard `.data` | 28409,245 |
| Fin HTTP Dashboard, statut 200 | 29883,477 |
| Image : IDE encore affiché, aucun fichier sélectionné | 32699,806 |
| Dernière lecture d’URL IDE par l’assertion | 32910,708 |
| Image : Dashboard affiché | 33594,409 |
| Échec de l’assertion URL, délai inchangé de 5000 ms | 33687,416 |
| Snapshot suivant : URL Dashboard | 34042,443 |

Les deux images ont été inspectées : [IDE avant transition](captures/selection-mobile-2026-10-12/interruption-avant-dashboard-2026-10-13.jpeg), [Dashboard avant expiration](captures/selection-mobile-2026-10-12/interruption-dashboard-avant-timeout-2026-10-13.jpeg). Le rendu Dashboard arrive entre la dernière lecture d’URL et l’expiration de l’assertion. C’est compatible avec une navigation tardive dans la fenêtre entre deux échantillons, mais la trace originale ne donne ni l’instant exact du changement d’URL ni l’état interne du routeur. La libération de l’archive dans le finally ne peut pas être déclarée cause du déblocage : le Dashboard était déjà rendu avant l’échec. L’écart entre la fin HTTP et le rendu n’est pas expliqué par ces seuls éléments.

### Mesures ajoutées sans modifier le parcours

La fixture optionnelle `mobileNavigationDiagnostics`, demandée seulement par ce scénario, collecte au maximum 160 événements Node et 120 émissions par document, pendant 90 secondes au plus. Elle lit catégories de routes, index/longueur d’historique, état de chargement du routeur, destination, disponibilité de l’en-tête IDE et du titre Dashboard anglais. Aucun contenu de fichier, URL, identifiant de projet, cookie, corps réseau ou secret n’est joint. L’attachement est protégé contre rejet et borné à deux secondes ; les assertions et délais du test sont inchangés. Les observations privées du routeur sont facultatives et restent purement diagnostiques.

Dix passages instrumentés réussissent (deux séries de cinq, un worker, zéro retry ; le serveur web local a été redémarré avant la seconde série). Le routeur conserve IDE pendant `loading` vers Dashboard, puis passe à Dashboard/`idle` avant libération de l’archive dans les dix cas. Les délais du marqueur second Retour à la navigation vont de 634 à 2354 ms. Aucun événement éliminé par la borne Node, aucune redirection observée après l’entrée dans ce parcours. La capture du dernier passage a été inspectée. [Mesures classifiées](mesures/selection-mobile-2026-10-12/navigation-diagnostic-2026-10-13.json). Ces succès excluent un blocage systématique par l’archive, pas une course ou lenteur intermittente.

### Preuves comportementales distinctes du hash

Le rescellement AST certifie seulement les cinq lignes du callback dans la tranche gelée, pas le comportement. Celui-ci est vérifié par les parcours README (absence momentanée d’audit puis choix explicite d’other) et les vrais stores. Retirer temporairement la conservation des sauvegardes concurrentes sur la source actuelle fait échouer exactement les deux variantes texte/vide ; les 14 autres tests d’archive restent verts (`navigation-guard-counterproof.log`). Source restaurée à l’identique, 31 tests passent : 16 archive/runtime, 2 sélection, 7 AST, 6 index (`navigation-guards-green.log`). La contre-épreuve distincte du remplacement par une archive externe était rouge avec le Set permanent et verte avec les versions par requête.

Lint, formatage et typage strict du diagnostic passent. Relecture indépendante : collecte limitée à ce seul cas et attachement protégé à la suite des réserves ; aucun changement d’assertion ou délai. Build produit inchangé depuis `7496ce62f`. Pas de push ni nouvelle PR.

Les deux autres signaux transmis par le parent (popover Agent Power après appui intérieur, croix Webview à 406,0286 px dans 390 px) sont consignés séparément dans l’inventaire ; aucune investigation ni correction dans ce lot.

## Intégration de main après #731 — 13 octobre 2026

Fusion locale réelle de `ee47caba7c90e32455f45f463ced0351aeada125` dans la branche mobile, depuis `c5ff101de39b1ba39eeda38ff629895824092b74`, avec `rerere.enabled=false` et `rerere.autoupdate=false`. Seul conflit : index des bugs, régénéré depuis les fiches (427 entrées). Aucun rebase ni squash. La fusion #731 à 00:18:10 UTC a été vérifiée via l’API GitHub et inscrite au journal, avec attribution au parent et sans attestation de déploiement.

La revue fichier par fichier confirme que `reloadFromRuntime` de FilesStore reste identique à main et conserve la protection des mutations concurrentes au listing. `replaceWithProjectStorageFiles` et les versions de sauvegarde par requête restent identiques au lot mobile. BaseChat, son helper, Workbench.client, WorkbenchStore et la garde AST restent identiques au parent mobile. FloatingPaneFrame et index.scss restent identiques à main : aucune protection de contraste supprimée. Les dépendances et le lockfile sont inchangés. Relecture indépendante favorable ; les deux remarques de présentation du journal ont été appliquées.

Validation de l’arbre fusionné : 160 tests ciblés réussis, puis le test de contraste initialement ignoré faute de chemin navigateur est relancé avec Chromium système et réussit (161 tests distincts au total). Les six captures réelles clair/sombre à 390, 768 et 1440 ont été inspectées. Typecheck global, typage strict E2E, lint ciblé et formatage passent. Les journaux sont sous `/tmp/mobile-selection-evidence/main-integration-*`.

Le build fusionné réussit. Premier passage navigateur : **7/9 réussis, 2 rouges**, un worker et zéro retry, 4 minutes. L’interruption et le choix explicite `other.txt` passent. Le cas réponse mémoire tardive A → B échoue ligne 375 avant apparition de `PROJECT-B-DOCUMENT` (10 s) ; un `ECONNRESET` de `route.fetch` est également consigné ligne 349, sans attribution causale. La [capture A → B](captures/selection-mobile-2026-10-12/integration-main-reponse-tardive-rouge.png) montre le chargement IDE. Le cas README sans choix explicite échoue ligne 423, absence de `.cm-content` pendant 5 s ; la [capture après échec](captures/selection-mobile-2026-10-12/integration-main-readme-attente-rouge.png) montre déjà le README attendu. Ces captures et celles des parcours réussis (rechargements 390/768, interruption, choix explicite) ont été inspectées. Les délais et assertions sont inchangés. Les traces brutes restent sous `/tmp/mobile-selection-evidence/main-integration-browser` ; elles contiennent des sessions synthétiques locales et ne sont pas publiées. Aucun défaut produit supplémentaire n’est attribué par ces seuls résultats. La validation navigateur de l’intégration n’est pas uniformément verte.

Deux répétitions inchangées de chacun des deux cas rouges réussissent ensuite : **4/4**, un worker, zéro retry, 2,9 minutes (`main-integration-repeat.log`). Dernière capture README restaurée inspectée. Les deux rouges initiaux, le rouge de navigation antérieur et leurs causes non établies restent ouverts. Relecture indépendante finale confirme les protections et la présentation factuelle des résultats. Fusion sauvegardée localement pour revue parent ; aucun push, nouvelle PR ou déploiement. La préparation popover/Webview reste séparée sur `codex/mobile-popover-webview-repro-20261013`, commit `e3d53f0b2222587f5d1f7771bbe86bce5b51ef04`, avec seulement collecte de deux tests, sans exécution de ces parcours ni correction.
