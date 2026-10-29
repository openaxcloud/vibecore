# Couverture de cette passe UI IDE — 28 octobre 2026

Le registre `app/lib/ide/panel-registry.ts` contient **31 panneaux adressables canoniques**, alias exclus. Au29octobre, **31 panneaux sur31 ont chacun au moins une recette visuelle locale ciblée**, plus cinq sous-pages Settings exercées partiellement sur sept (Projet, Compte, Préférences, Usage, Memory). Ce décompte est la somme des21panneaux précédemment recensés et des10panneaux ci-dessous ; il ne signifie pas31panneaux fonctionnellement validés. Aucun de ces nombres ne signifie une certification complète de panneau ou de plateforme. Les validations antérieures et celles des autres sessions ne sont pas reprises comme nos propres résultats.

| Surface | Recette réellement effectuée | État / limite |
| --- | --- | --- |
| Snapshots | 390/820/1280, loading/vide, texte long, détails clavier et503→Retry | Neuf recettes synthétiques ; aucune création/restauration réelle. |
| Collaborators | 390/820/1280, loading/vide/503→Retry, commentaire URL long | Six recettes vide/reprise ; débordement reproduit trois formats, correctif local validé sur build compilé390/820/1280 sans injectionCSS, non publié. Complément29/10 : trois pertes de formulaire1280→390 reproduites après commit responsive ; deux témoins établissent directement le détachement des anciens nœuds. Trois recettes compilées1280→390→1280 conservent le formulaire complet (identifiant/rôle UI, corps/chemin/ligne), sans soumission ; consommation atomique/version récente et ABA couvertes en composants seulement. Aucune invitation/permission réelle. |
| Extensions | 390/820/1280, loading/vide,503→Retry, texte long, recherche et clavier | Neuf recettes synthétiques ; aucune installation/activation réelle. |
| Workflows | 390/820/1280, loading/vide,503→Retry, détails et historique longs au clavier | Six recettes vide/reprise ; débordement reproduit trois formats, correctif local compilé sans injectionCSS3/3vert, non publié. Aucune commande exécutée ni sauvegarde. Poignée de déplacement clavier hors validation. |
| Files | 390/820/1280 × FR/EN, noms longs, menu clavier et resize ; IME en composants | #833 protège IME. Menu local : 13 contextes et 143 cibles clavier/hit-test verts, plus zoom navigateur 200 % ; lot assemblé en brouillon dans #838. |
| Editor | Texte modifié conservé sur six transitions ; curseur sélectionné mesuré sur trois transitions CodeMirror/Monaco | Focus et sélection perdus avant correction ; trois transferts corrigés et vérifiés localement, y compris chargement LazyWorkbench à froid et absence de flash Agent ; CRLF non pris en charge ; aucun backend réel validé. |
| Terminal | Menus clavier 390/768/1280/1920, portrait/paysage844×390, visibilité intégrale des huit contrôles | #837 : échec Terminal1280 sur trois tentatives. Remplacement de coque et perte du menu/focus ensuite reproduits localement à390/768/1280 ; transfert éphémère corrigé et trois recettes finales compilées vertes, sans retard du chat. Pas de Shell réel, clavier virtuel ou recette Safari de ce lot. |
| Search | Réponses périmées, remplacement de coque, 390/1280, sélection/caret, resize, Agent/Retour/Suivant | #833 protège le réseau ; #836 protège brouillon/focus. #838 contient la synchronisation du test sur le routeur, mais une reprise CI persiste après route idle. Le désaccord URL Search/surface Agent est ensuite reproduit et corrigé dans le lot local suivant : quatre recettes compilées390/768/390/820 passent. CI/livraison de ce complément non exécutées à ce stade ; #834 reste ouvert. Contre-preuve avec ancien nœud détaché sur Chromium ; API synthétique. |
| Settings / Usage | Première passe320/390/768/1024/1280/1440 ; après CSS360/1280 avec scroll clavier du tableau | Aucune opération financière réelle. Les autres formulaires Settings ne sont pas certifiés. |
| Settings / Memory | Trois resize, états loading/erreur/vide, sauvegarde503 interceptée, six recettes finales360/390/820/1280 dont sombre et zoom natif 200 % | #835 validée localement ; aucun enregistrement client ni backend Memory réel. |
| Ports | 1280 FR/EN, GET synthétiques, aucun clic de mutation | Correction locale compilée vérifiée : action private proposée en FR/EN ; aucun port réel modifié. |
| Packages | 1280 FR/EN, gestionnaire sélectionné via bouton local | aria-pressed corrigé et vérifié en navigateur FR/EN. Aucune installation exécutée. |
| Problems | 390/820/1280, chacun à100% et zoom natif200%, chemin long en état frontend synthétique | Six recettes compilées vertes, focus/Entrée ouvrent le fichier synthétique ; aucun backend réel. |
| Skills | 390/820/1280/1536, vide/Community et description Built-in longue synthétique | Débordement reproduit puis corrigé localement ; quatre recettes compilées sans override passent. Aucune installation/toggle, backend réel, Safari ou zoom200%. |
| Locks | États vide390/820/1280 et peuplé synthétique390/1280 | Géométrie seulement ; aucune opération verrouiller/déverrouiller et petites cibles encore à caractériser. |
| Settings / Compte et Préférences | FR/EN1280/1920, aller-retour390, zoom200%, deux panneaux simultanés | Six recettes compilées vertes : brouillons isolés, onglets conservés, thème accessible ; aucune sauvegarde de compte réelle. |
| Logs | 390/820/1280, 60 lignes synthétiques, URL longue, filtre vide puis reprise, clavier | Trois recettes passent ; scroll horizontal local permis, aucun défaut confirmé. Aucun flux réel. |
| Activity | 390/820/1280/1536/1920, split réel sur grands écrans et resize avec filtre | Grille trop large reproduite puis corrigée localement ; cinq recettes compilées passent. Pas de backend réel. |
| Overview | 390/820/1280, libellés longs et503→Retry clavier→récupération | Six recettes passent. Vide390/820 passe ; premier vide1280 dépasse5s avant affichage, cause inconnue : pas un succès sans reprise. |
| Monitoring | 390/820/1280, libellés longs et503→Retry clavier→récupération | Six recettes passent ; filtre24h activable par Entrée. Pas de métriques runtime réelles. |
| Database | Vide390/820/1280, boutons et géométrie | Trois recettes passent, aucun clic Create ni SQL ; provisionnement non exercé. |
| Object Storage | 390/820/1280, chargement,503, Retry clavier, état confirmé | Erreur masquée reproduite puis corrigée localement ; six recettes compilées passent. enabled:true/provisioned:false ne signifie pas bucket prêt ; Enable jamais cliqué. |
| Env | 390/820/1280, vide,503→Retry, clés/valeurs synthétiques longues, filtre et resize | Filtres perdus3/3 avant ; trois recettes compilées après correction passent aller-retour et détachement réel. Premiers1280timeout avantGET, essais isolés suivants verts sans cause établie. Aucun Save ni valeur réelle ; valeurs non persistées. |
| Secrets | 390/820/1280, liste de clés synthétiques, vide/reprise, filtre, menu clavier | Filtre perdu et Escape→BODY reproduits3formats ; double tooltip desktop. Filtres3/3 et Escape3/3 compilés passent ; tooltip final3/3 vert après trois rouges compilés conservés. Aucune valeur réelle révélée/copiée, ajout/suppression ou permission. |
| Studio | 390/820/1280, vide/loading,503→Retry clavier, consensus long ouvert par Entrée | Vide/reprise6recettes ; longs détails débordent3formats. Grille/repli compilés3/3 sans injection DOM, texte intégral conservé. Aucun appel IA, patch, branche ou réparation réelle. |
| Security | 390/820/1280, vide/reprise, onglets clavier, détails longs et profil non soumis | Vide/reprise6recettes ; overflow820 et profil perdu1280→390 reproduits. Repli3/3 et profil3cas visés compilés passent ; précondition erronée820→390 conservée, vrai remontage820→1280 vérifié séparément. Aucun scan, Ignore, Restore, Save, export ou changement de droits. |
| Preview | 390/820/1280, overlay de démarrage, étapes et ouverture des logs au clavier | Trois recettes visuelles startup seulement ; WebSocket synthétique indisponible. Aucune iframe applicative fonctionnelle, runtime prêt, start/stop ou reprise réelle validé. |
| Debugger | 390/820/1280, vide/loading,503→Retry lecture seule, données longues | Six recettes vide/reprise ; corps débordant3formats, trois recettes compilées du corps passent ; complément Remove final3/3 vert avec containment strict, clic d’essai et focus, aucun clic activant. Aucun attach, step, run, stop ou moteur réel. Premiers timeouts avantGET conservés. |
| Git | 390/820/1280, vide,503→Refresh clavier, branche/chemin longs | Vide/reprise6recettes ; branche longue déborde1280, deux reproductions. Incident réservé au propriétaire, contre-preuve DOM seulement ; aucun correctif source ni OAuth/commit/push/pull. |
| Deployments | 390/820/1280, vide, échec synthétique long,503→Retry GET | Géométrie et lecture seulement ; premier1280timeout avantGET puis reprise isolée verte, cause inconnue. Aucune publication, réparation ou exécution client. |
| Domains | 390/820/1280, vide, domaine pending/TXT synthétiques longs,503→Refresh GET | Géométrie et lecture seulement ; premier1280timeout avantGET conservé. Aucun ajout/suppression, vérification DNS ou mutation réelle. |
| Integrations | 390/820/1280, catalogue/recherche vide puis restauration,503→Retry GET | Catalogue statique seulement ; premier1280timeout avantGET conservé. Aucun OAuth, connexion métier, APIkey/webhook, scaffold ou autorisation réelle. |

Agent : défaut Escape du menu outils reproduit sur quatre formats puis corrigé dans un lot local séparé de #838. Neuf formats compilés320/360/390/768/820/1280/1536/1920 et paysage844×390 passent fermeture, focus, géométrie et brouillon. Deux parcours supplémentaires390/1280 conservent le brouillon pendant resize vers768 puis1280 puis format initial. API synthétiques, aucun prompt envoyé. Pas d’audit intégral du fil, interruptions ou exécution Agent. L'affichage de Preview dans les fixtures ne constitue pas une recette runtime ou production.

## Ce que le décompte31/31 ne valide pas

Aucun panneau canonique n’est désormais totalement absent de la cartographie visuelle locale ; chacun reste partiellement exercé. Les10nouveaux sont `env`, `secrets`, `studio`, `security`, `preview`, `debugger`, `git`, `deployments`, `domains`, `integrations`. Les parcours backend/runtime réels, OAuth, publication/DNS, permissions et IA n’ont pas été exécutés dans ce complément. La simple visibilité d’un panneau ne valide ni son service ni toutes ses interactions. Preview est explicitement limité au démarrage/logs. Git comporte encore un défaut réservé non corrigé.

Publish/Domains, messages Agent et historique sont suivis dans d'autres sessions (#831, #830 et #832) ; leur seule existence ne vaut pas preuve de livraison ou de couverture complète. Les fichiers modèles/budget/workbench store du hub #828/#829 sont préservés.

## Nature des preuves

Chromium local et fixtures synthétiques isolées, composants/CSS réellement compilés. Tests unitaires, tests de CI, recette locale et version déployée sont distincts. Les PR #833/#835/#836 sont des brouillons tant que leurs contrôles exacts et la fenêtre de livraison ne sont pas satisfaits. Pas de certification Safari, appareil physique, safe areas matérielles, clavier virtuel, lecteur d'écran, ultralarge ou contraste exhaustif. Aucun mock ajouté au produit et aucun contrôle de CI diminué.

Le canari WebKit CI de #833 passe 19 tests et en ignore 3 ; ce résultat ciblé ne valide pas les sept panneaux sur Safari ou appareil physique. Les recettes détaillées de cette passe utilisent Chromium.

Les sous-pages IA et Sécurité ont été lues statiquement seulement dans ce complément. Les notifications Settings globales restent un incident distinct à caractériser ; aucune isolation de ces notifications n’est revendiquée. La correction Problems est groupée avec le complément Settings dans le brouillon #838, assemblage des PR833/835/836/837, sans fusion ni déploiement. Le gate SBOM de main bloque la fenêtre de livraison.

## Complément messages et données local, distinct des têtes838/839

Le header des blocs de code Agent recouvrait la première ligne. Six recettes compilées passent après correction (clair390/820/1280/1536, sombre390/1280), avec erreur de copie puis reprise, texte exact, clavier et scroll horizontal. Le helper géométrique exact ajouté aux deux scénarios E2E existants passe localement à390/1440 ; la suite complète attend l’API de seed isolée en CI. Le contraste mesuré concerne seulement le retour de copie, pas tout le thème syntaxique.

Les nouveaux reçus sont dans [le dossier de preuves](../bugs/ui-agent-data-panels-evidence-20261028/README.md). Les nouveaux correctifs ne sont pas fusionnés ni livrés. Aucun résultat de cette section ne certifie Safari, appareil physique, zoom200%, clavier virtuel, safe areas matérielles ou backend réel. Search après Retour et retourB→A#834 restent ouverts dans cette matrice jusqu’à leurs preuves spécifiques ; ils ne sont pas déclarés corrigés par ces recettes.

Complément du29octobre : retour interprojetB→A#834 non reproduit dans six parcours locaux768 (troisCPU×4surRetour). Deux timeoutsCPU×4au démarrage se produisent avantRetour, aucune conclusion produit. Agent : quatreimages respectant contrat ne débordent pas dans six recettesFR/EN390/820/1280 ; Maj+F10 ne déclenche pas le menu utilisateur malgré focus Tab. Ce défaut est réservé au propriétaire messages/historique ; aucune correction dans ce lot.

## Lot local de services du29octobre, base #841

Les preuves des dix panneaux et du complément Collaborators sont regroupées dans [ui-service-panels-evidence-20261029](../bugs/ui-service-panels-evidence-20261029/README.md). Les correctifs locaux portent sur filtres Env/Secrets, profil Security, formulaire Collaborators non secret en mémoire isolée seulement, Escape Secrets sans vol de focus extérieur, exclusivité tooltip global/secours CSS, repli Studio/Security et layout Debugger. Les filtres Env/Secrets, focus Secrets, repli Studio/Security, profil Security et formulaire Collaborators disposent maintenant des recettes compilées détaillées dans le dossier de preuves. Tooltip et Remove Debugger disposent maintenant de3/3 recettes finales strictes chacun ; les échecs précédents restent documentés. Aucun résultat après simple injection DOM n’est présenté comme validation du produit corrigé. Bilan final local transmis par le parent : build client/SSR vert,136/136tests dans huit suites,16tests inventaire déjà verts, typage complet avant derniers deltas puis typage web final, lint0erreur/52avertissements préexistants. Les sous-totaux se recouvrent et ne sont pas additionnés.

Premiers essais1280 avantGET et erreurs de préparation (Diff scopes/Exit diff, aria-current, libellés Refresh, toolbar Preview absent au démarrage) restent dans les reçus. Les reprises isolées n’établissent pas leur cause ni une réparation. Le retour interprojetB→A#834 et la fragilité README restent ouverts et distincts. Aucun backend réel, secret, opération client, nouvelle ressource ou permission. Aucun déploiement de ce lot et aucune validation globale de l’IDE revendiqués.

Validation finale ciblée complémentaire : Secrets focus3/3 sur le dernier build ; Tooltip26/26tests avec clavier global et revue indépendante14/14 ; revue Debugger favorable. Toujours aucune validation production/authentifiée ou backend/runtime réel. Git branche longue reste réservé et ouvert, de même que834/README. Aucun état de fusion/livraison n’est déduit des recettes locales.

Sauvegarde des sources validées : commit local `424fc10eb`, parent `47b1`. Aucun push de ce nouveau lot. Les serveurs de recette du parent ont été arrêtés après vérification de leur identité PID ; sortie des enfants et fermeture des ports confirmées. Cela ne constitue pas un déploiement.

## Complément zoom natif200% — non publié

Branche locale `fix/ide-native-zoom-controls-20261029`, distincte de #843 en CI. [Méthode et reçus](../bugs/ui-native-zoom-controls-evidence-20261029/README.md) : réglage Chromium natif réellement mesuré,390/820/1280physiques→195/410/640CSS, DPR2, CSSzoom1. Studio/Security9/9, Collaborators3/3 et Debugger3/3 passent leurs parcours ciblés sans mutation réelle. Env/Secrets5/6 : filtre conservé mais en-tête Secrets débordant à195CSS. Tooltip/menu Secrets2/3 : largeur280/220px dépasse195CSS ; défaut natif confirmé, correctif compilé encore attendu.

Les échecs CSSzoom antérieurs ne sont pas déclarés bugs produit ; méthode inadéquate pour la même situation de media queries. La première précondition Env2560×900physiques restait compacte et n’exerçait pas le détachement attendu ; les reçus demeurent distincts du parcours corrigé2560×1800. Aucune assertion réduite, aucun résultat vert par simple reprise revendiqué.

31/31 demeure un inventaire de recettes locales partielles. WebKit local absent, Safari/appareil physique et production/backend réels non validés. Les notes README/#834 restent des diagnostics historiques sans cause prouvée ; hôte d’artefact historiquement refusé non retenté, aucun téléchargement ni contournement. Aucun état de main ou déploiement déduit de cette passe.

Mise à jour zoom : Secretsheader natif3/3 et Tooltip horizontal3/3 passent sur le build corrigé. Tooltip vertical français410×300CSS reste rouge (hauteur258, bottom452>292), correctif de hauteur en cours et verdict final attendu. Canari WebKit CI #843 job123211133065 :19réussis/3ignorés, sans reprise signalée ; ce n’est pas une recette de zoom local.31/31 reste ciblé/partiel.

Diagnostic README précisé : badge frère compatible avec le locator de nom834, mais incompatible avec la regex du texte entier de ligne840 dans un DOM synthétique. Fragilité840 conditionnelle prouvée, présence du badge au moment de l’échec CI non prouvée ; aucune cause commune établie et aucune assertion changée. Voir [les deux locators](../bugs/ui-native-zoom-controls-evidence-20261029/readme-badge/README.md). Aucun artefact refusé retenté.

Verdict final zoom local : commit source `c789d06bd` basé825, Tooltip4/4 compilés (FRvertical +3formats, tous bords/marges8px) et Secretsheader3/3 natifs verts. Build client/SSR, typage web,98tests ciblés, lint et revue indépendante22tests verts (recouvrements, non additionnables). Les rouges initiaux restent archivés. Limite non résolue : tooltip plus haut que le viewport. Aucun push/main/déploiement ni validation production revendiqué ;31/31 reste ciblé/partiel, WebKitCI distinct du zoomlocal, README840 conditionnel et834 ouvert.

## Dernier verdict : occlusion corrigée et captures inspectées

Les quatre recettes géométriques précédemment vertes ne prouvaient pas une visibilité complète : l’inspection visuelle française par le parent a révélé les premières lignes derrière le header. `tooltip-layer-before/receipt.json` confirme header11002 contre tooltip10000, sans ancêtre créant une couche concurrente. Ce résultat antérieur reste une preuve de placement/interactions seulement.

Le delta source local `e520a1b2a` place uniquement le tooltip à11003 : au-dessus du header11002, sous menus12041/12045 et modales12059. La garde exige aussi que toutes les couches lues soient finies et strictement positives, pour ne pas réussir si un sélecteur disparaît. Base locale rebasée `5bca3e301`, parent `ef764` ; tête source avant documentation `e520a1b2a`. Aucun push/main ou déploiement n’est déduit de ces commits locaux.

Le build client/SSR et typage web sont verts. Les tests agent35/35, revue indépendante21/21 puis garde renforcée21/21 réussissent ; ces ensembles se recouvrent, ne pas les additionner. Les reçus `tooltip-native-vertical-layer-final` et `tooltip-native-layer-final` passent4/4, sans injection CSS ni reprise, avec couches calculées11003>11002 et assertions de bords/texte/focus/Escape/menus. Les quatre captures ont été ouvertes et inspectées ; le parent confirme en français la première ligne « Actions pour » intégralement visible, ainsi que les dernières lignes contenues. Les anciens rouges et les verts géométriques insuffisants restent conservés.

Limite inchangée : tooltip plus haut que le viewport non résolu. Recette Chromium native locale synthétique uniquement, pas Safari/WebKit local, appareil physique, backend ou production authentifiée. Secretsheader3/3 reste documenté.31/31 reste ciblé/partiel ; Gitlong réservé,840 conditionnel et834 ouverts. CanariCI84319réussis/3ignorés reste distinct du zoom local. Aucun artefact historiquement refusé retenté.

## Complément en cours : lecture d’une aide réellement tronquée

La limite historique « tooltip plus haut que le viewport » a maintenant une preuve native ciblée :410×200CSS, clientHeight174/scrollHeight257, overflow:hidden ; PageDown ferme l’aide au lieu d’accéder aux dernières lignes. Le correctif local détecte le clipping et propose lecture complète explicite/F1 vers une surface non modale FR/EN, texte défilable focalisable, sans piège Tab ; Escape/focus et Ctrl+S préservés. Les parcours compilés sont encore en cours : ne pas déclarer cette limite résolue avant leur résultat final. Le bouton transitoire n’est pas revendiqué accessible via Tab depuis l’ancre ; F1 est l’entrée clavier explicite.

[Preuves de l’aide haute et diagnostic menu390](../bugs/ui-tall-help-evidence-20261029/README.md). Les6/6 essais locaux du menu390 n’expliquent pas le retryCI ; aucune correction menu ni résolution834/840 revendiquée, aucun artefact refusé obtenu par une autre voie. Build/typage complet et lint0/52 verts rapportés, tests ciblés encore distincts de la validation compilée finale. Aucun nouvelID, index, publication ou livraison impliqué.

## Résultats compilés, avec limites d’intégration conservées

Les reçus distinguent strictement les sous-parcours atteints :

- Recette primaire `tall-help/compiled` : lecture clavier F1/PageDown/End jusqu’au marqueur final et texte intégral3/3, resize/Escape également vérifiés. Scénario complet1/3 seulement : les deux autres cas échouent avant le trajet pointeur, ancre Secrets derrière la navigation fixe à200CSSpx de hauteur. Ces échecs ne sont pas présentés comme résolus.
- Recette pointeur distincte `compiled-pointer` :2/2 à hauteur accessible, texte plus long pour rester tronqué. elementFromPoint prouve l’ancre atteignable avant déplacement réel12pas et clic ; lecture complète, resize, Escape et sortie ShiftTab passent. Ce n’est pas une répétition verte du même scénario bas en échec.
- Régression tooltip ordinaire :3/3, géométrie, texte, fermeture/focus et menus préservés.
- Revue indépendante `compiled-stable-fixture` :4/4 avec véritable renderer compilé et ancre DOM synthétique stable, EN/FR,100/200% natif. F1, PageDown/End/Home/roulette, clic20pas, navigation Tab non piégée et resize passent. Cette fixture ne valide pas la visibilité de la vraie ancre Secrets.
- Intégration indépendante `compiled-real-secret-anchor` :1/4 complet (390×320@100%),3/4 incomplets à200% avantF1. Ancres occultées par navigation/surface mobile ou horszone ; disparition de l’offre non isolée dans tous les cas. Aucun élargissement de seuil, nouvelle reprise ou correction de ces trois cas revendiqué.

Quatre échecs de harnais indépendants initiaux restent dans `compiled-independent` : locator sur dialogue déjà démonté, attribut réécrit parReact, et un cas de disparition non isolé. La fixture stable corrige la méthode, pas le produit. Aucun des quatre rouges n’est effacé ou compté vert.

La revue a aussi reproduit un défaut réel de survol périmé après changement de route (`independent/timer-route-receipt.json`). Le correctif est en préparation ; sa validation finale reste attendue. Les résultats précédents ne prouvent donc ni clôture complète de l’incident ni disponibilité sans réserve de tous les parcours. Les diagnostics menu390/834/840 restent distincts et ouverts.

Aucun accès à des profils/caches/logs bruts ou secrets dans ce dossier. Tests synthétiques Chromium local seulement, pas backend réel, Safari/WebKit local, appareil physique ou production. L’accès clavier de l’offre reste F1 depuis l’ancre : aucune promesse de Tab depuis celle-ci vers le bouton transitoire. Aucun index, publication ou livraison déduit des recettes.

## Correctif du timer de survol validé, contrôle navigateur final en cours

Le contre-exemple indépendant `timer-route-fixed-receipt.json` passe après le correctif : lecture ouverte, puis ni dialogue ni tooltip périmé après fermeture/navigation. L’ancien reçu rouge `timer-route-receipt.json` reste conservé. Le nettoyage du timer empêche le survol différé de rétablir une aide de l’ancienne route.

Validation transmise par le parent :45/45 suite agent et113/113 tests ciblés root (recouvrements, ne pas additionner), build client/SSR final et typage web verts. Typage complet réussi avant les trois lignes de nettoyage clearTimeout ; lint complet0erreur/52avertissements préexistants. Le dernier smoke navigateur sur build final est encore en cours : aucun résultat anticipé.

La limite de contenu plus haut que le viewport est traitée par une lecture complète explicite, pas par la promesse de faire tenir tout texte dans le tooltip court. F1 depuis l’ancre et la surface non modale défilable ont leurs preuves de lecture jusqu’à la dernière ligne. Les occlusions de la vraie ancre Secrets par la navigation aux petites hauteurs restent non résolues : recette indépendante réelle1/4, trois extrêmes200% incomplets avantF1, distincts des4/4 du renderer à ancre synthétique. Les premiers rouges et le scénario primaire complet1/3 restent visibles ; aucune certification générale ni réparation de ces occlusions n’est revendiquée.

Toujours Chromium local/synthétique, pas Safari/WebKit local, appareil physique, backend réel ou production authentifiée ;31/31 ciblés partiels. Publication et livraison du lot ne sont pas déduites de cette documentation.

## Verdict du dernier smoke compilé

`final-timer-build/receipt.json` passe1/1 sur le build final du correctif timer : F1, lecture jusqu’à la dernière ligne, redimensionnement, Escape, déplacement réel de souris à travers l’espace, sortie Tab et changement de route sans aide périmée. L’attente de ce contrôle est clôturée ; ce cas ne remplace pas les scénarios distincts incomplets ou en échec décrits plus haut. Les occlusions de navigation aux petites hauteurs et la recette indépendante de vraie ancre Secrets1/4 restent explicitement non résolues. Aucun verdict global Safari/production ou31/31 fonctionnel.

### Captures synthétiques pour revue

Deux images originales820×400 sont copiées sans édition dans `captures/` : `before-820-tooltip.png` montre l’aide courte tronquée ; `after-820-fr-last-line.png` montre la lecture complète explicite après F1 puis End, avec dernière ligne visible. Même format, mais états d’interaction différents : ce n’est pas une comparaison pixel à pixel du même état. La capture après provient du build de lecture complète précédent ; le dernier correctif timer ne change pas ce rendu visuel. Les textes sont synthétiques, aucune donnée cliente ou secret réel. Empreintes des originaux dans le manifeste.

Ces preuves rendent le lot prêt pour la revue/publication coordonnée, sans prétendre qu’une publication, fusion ou livraison a déjà eu lieu.
