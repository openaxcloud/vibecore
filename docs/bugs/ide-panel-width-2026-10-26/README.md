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
- La réinjection du titre natif a été corrigée après intégration de main #808 pour les contrôles ayant un `aria-label` indépendant ; les titres servant seuls de nom accessible sont conservés. Voir le rapport d’intégration ci-dessous. FileTree reste inchangé.
- Settings Usage/Memory : correction appliquée après intégration de #808, avec classes locales conditionnelles et défilement clavier du tableau. Les autres onglets Project/Account restent hors correction.
- Les trois reprises de la CI de PR #807 et la chaîne de capture/stockage des vignettes restent des incidents distincts. La CI de main #807 verte ne les clôt pas.
- Pas de Safari physique, lecteur d'écran, clavier virtuel matériel, ni recette authentifiée des projets clients. Les contrôles de menu desktop mesurent 34 px ; aucune revendication de cible 44 px sur tout le menu desktop.

Les rapports de sous-composants gardent leur chronologie : le rapport menu mentionne le toast encore ouvert au moment de sa rédaction ; le dossier `toast` contient sa correction ultérieure. Les chemins `/tmp` cités décrivent les preuves locales, et ne sont pas des fichiers produit.

Cette archive est une sélection de reçus et de captures avant/après, **pas un harness navigateur complet exécutable**. Les scripts `prepare.cjs`, `check.cjs`, `actions.cjs`, les traces intermédiaires et les journaux cités par les rapports de sous-composants restent dans leurs dossiers `/tmp/ui-agent-panel-width`, `/tmp/ui-file-action-layout` et `/tmp/ui-toast-panel-after`. Les tests unitaires produit sont bien versionnés avec ce lot.

[État après intégration de main #808, validations et correction Escape](integration-main-70f40edb/README.md). Cette section actualise les propositions initiales ; aucun raccordement #812 n’est inclus.

## Intégration de main #810

Main `5790f5b1d6b2187842f23255fc49d6f1f9f6e4ca` intégré après #808. Le seul conflit porte sur l’index dérivé, régénéré à 527 fiches. Les cinq fichiers produit/tests de #810 sont identiques à main ; les 65 fichiers du lot #811 hors index étaient identiques à la tête précédente `052487353` avant cette note. Le raccord #812 reste séparé.

Revue indépendante favorable. Sur cette base intégrée : 203 tests ciblés dans 20 fichiers réussis, incluant les contrôles UI/focus/index et les tests fournisseur/journalisation de #810 ; typage web et build client/SSR réussis, lint sans erreur (52 avertissements préexistants). Les recettes navigateur documentées plus haut restent celles de la tête précédente : elles ne sont pas présentées comme de nouvelles recettes de cette intégration. La CI de la nouvelle tête doit rendre ses propres verdicts. Aucun changement d’assertion ou de délai pour la reprise de restauration à 768 px observée sur `052487353` ; cause toujours indéterminée.

## Intégration de main #812 — 27 octobre

Main `8497099bd047a07ac25401a11f7964768a6718ba` intégré sans conflit. Index régénéré, inchangé à 527 fiches. Revue indépendante : les 21 fichiers apportés par main sont préservés et le delta produit UI #811 reste identique à `22fd32468`. Le complément UI du modèle observé et des confirmations réactives reste distinct ; ni ce complément ni le lot palette #768 ne sont incorporés.

Sur cette base : 414 tests ciblés dans 32 fichiers réussis, typage web et build client/SSR réussis et lint sans erreur (52 avertissements préexistants). Les tests incluent les contrats de confirmation d’écriture sur disque isolé ; ils ne constituent pas une recette production. Les anciennes captures navigateur conservent leur SHA d’origine ; la nouvelle tête exige ses propres contrôles CI.
