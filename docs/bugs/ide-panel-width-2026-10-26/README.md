# Panneaux Agent : menus, notifications et chemins

Base : `90d92ff12e12dc72b0516eb7da9bfea52552d44b`, livraison #807 confirmée le 26 octobre 2026 à 11:52:15 UTC. Ce nouveau lot est distinct et ne constitue pas une certification globale de l'IDE.

## Corrections

- Menu Outils : portail DOM stable, placement borné par le panneau et le viewport. Les six actions restent atteignables dans un panneau étroit. L'ouverture clavier focalise le premier contrôle après montage. Dialogues enfants, brouillons et focus sont conservés lors des redimensionnements ; Escape retrouve le déclencheur.
- Chemins d'actions : repli et alignement à gauche dans le panneau Agent, sans changement des handlers ou des statuts. Cibles mesurées à 44 px ou plus dans ce composant.
- Tooltips : GlobalTooltip laisse les contrôles Radix à leur propre renderer ; les aides obsolètes disparaissent au clic et les timers vérifient encore leur cible. Le déclencheur du menu ouvert conserve son nom accessible sans afficher une aide personnalisée superposée.
- Notifications desktop : mode compact dans l'IDE, largeur plafonnée à 380 px et ancrage dans le panneau Agent visible ; repli visible lorsque ce panneau est absent, masqué ou hors écran. Queue, erreurs, actions et focus conservés. Le défilement arrondit dans le sens du déplacement pour garder strictement le bouton focalisé visible.

## Preuves locales

| Surface                | Vérification                                                                                                                   | Limite                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Menu                   | 2048/1536/1280, panneaux 220/320/480, zoom natif 100/200 %, 18 observations et 108 contrôles atteints                          | JSX produit extrait avec dialogues réels et callbacks métier isolés ; pas IDE/backend client complet |
| Dialogues              | WebSearch et palette, saisie et focus conservés pendant 4 et 3 changements de taille, Escape imbriqué et clic extérieur        | Chromium local, données synthétiques                                                                 |
| Actions                | 9 observations : 2048/1536/1280 × panneaux 320/360/400 ; chemins intégraux, focus/Tab, hit-tests                               | Pas preuve d'ouverture backend du fichier                                                            |
| Notifications          | 6 configurations desktop et 2 zooms natifs à 200 %, Agent masqué/absent/hors écran/large, resize mobile                        | Vrai Toastify et styles produit dans fixture locale                                                  |
| Notification focalisée | Assertion stricte après resize : bas du bouton 343,125 ≤ bas de liste 344 ; même focus, queue de 3, fermeture clavier laisse 2 | L'ancien diagnostic à tolérance ±1 px a été rejeté ; aucune assertion finale assouplie               |

Le grand toast de 298,6 px a été reproduit sur les sources livrées de #807. Le nouveau correctif vise ce comportement desktop auparavant conservé, et ne suppose pas que les captures utilisateur venaient d'une version déjà mise à jour.

Validation intégrée : 60 tests dans 12 fichiers ; build client/SSR et typage web verts ; formatage vert ; lint app zéro erreur et 52 avertissements préexistants. Les 12 fichiers source de `source-hashes.json` sont restés identiques pendant ces validations. Revues indépendantes favorables dans les périmètres documentés. Aucun accès client, secret, service externe ou opération financière utilisé pour ces recettes.

## Incidents qui restent ouverts

- Les cinq captures Library sont reconnues, mais leur téléchargement a échoué. Cette session n'a inspecté que ses propres captures synthétiques ; les descriptions utilisateur viennent du parent.
- Le titre natif peut encore être réinjecté par `BaseChat.syncIconTitles` pendant une mutation DOM. Le correctif évite la duplication des aides personnalisées ; il ne prétend pas régler entièrement le titre natif. BaseChat et FileTree ont des travaux concurrents réservés.
- Settings Usage/Memory : patch isolé préparé et revu, mais non appliqué à BaseChat dans ce lot. Il ne change que des classes locales conditionnelles et la navigation clavier du tableau ; publication à coordonner avec #808. Les autres onglets Project/Account restent hors correction.
- Les trois reprises de la CI de PR #807 et la chaîne de capture/stockage des vignettes restent des incidents distincts. La CI de main #807 verte ne les clôt pas.
- Pas de Safari physique, lecteur d'écran, clavier virtuel matériel, ni recette authentifiée des projets clients. Les contrôles de menu desktop mesurent 34 px ; aucune revendication de cible 44 px sur tout le menu desktop.

Les rapports de sous-composants gardent leur chronologie : le rapport menu mentionne le toast encore ouvert au moment de sa rédaction ; le dossier `toast` contient sa correction ultérieure. Les chemins `/tmp` cités décrivent les preuves locales, et ne sont pas des fichiers produit.

Cette archive est une sélection de reçus et de captures avant/après, **pas un harness navigateur complet exécutable**. Les scripts `prepare.cjs`, `check.cjs`, `actions.cjs`, les traces intermédiaires et les journaux cités par les rapports de sous-composants restent dans leurs dossiers `/tmp/ui-agent-panel-width`, `/tmp/ui-file-action-layout` et `/tmp/ui-toast-panel-after`. Les tests unitaires produit sont bien versionnés avec ce lot.
