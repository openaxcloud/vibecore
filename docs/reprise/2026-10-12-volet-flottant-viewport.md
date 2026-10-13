# Volet flottant — confinement au canevas et parcours responsive

Base exacte : `dfd1d1f071a2e19a516833e8fff491fb5a818bd0` (fusion #730). Branche locale : `codex/floating-pane-viewport-20261012`. Aucun push ni nouvelle PR dans cette tâche. La fusion #730 a été relue via l’API GitHub : 12 octobre 2026 à 21:26:53 UTC, compte `openaxcloud`. Le journal précise que son déploiement était encore non attesté au moment de l’écriture.

## Contrat existant et cause démontrée

`RPL-IDE-001.3` décrit un cadre borné au canevas parent, déplaçable, redimensionnable et réancrable. Ce parent est `.bolt-project-main-panes`, dont l’ancêtre masque les débordements. Le code n’appliquait le clamp que pendant les gestes : les coordonnées initiales/restaurées 72,72 et la taille 720×480 pouvaient dépasser le canevas. À 1440×900 : bord droit du volet 1189 px contre 1158,265625 px pour le parent ; le bouton Dock finit à 1178 px et se trouve partiellement masqué par la bibliothèque. Capture [avant](captures/flottant-2026-10-12/avant-1440.png) inspectée. Le test durable échoue sur `initial-1440` avant correction.

À 768 et 390 px, le produit remplace le layout desktop par son IDE mobile/tablette. Le correctif ne crée aucun volet flottant dans ces modes et ne modifie aucun de leurs menus. L’exigence porte sur le contenu et les commandes accessibles, puis sur le rétablissement du volet borné au retour desktop.

## Correctif limité

Deux fichiers produit : `app/components/project-ide/FloatingPaneFrame.tsx` et `app/styles/index.scss`.

- CSS borne largeur, hauteur et position dès le rendu, ainsi qu’à tout changement de dimensions du canevas. Les minima s’adaptent aussi à un parent plus petit.
- Le déplacement/redimensionnement commence depuis la géométrie réellement affichée, et non depuis des dimensions persistées éventuellement supérieures à l’espace disponible.
- Le clamp JavaScript respecte le maximum disponible même sous les minima habituels. Aucun observateur de taille, changement du moteur de disposition ou réécriture automatique de la géométrie préférée.

## Parcours et contre-épreuves

Pile locale existante : API réelle, PostgreSQL, Redis, Mailpit, build `VITE_RUNTIME_MODE=remote-kubernetes`, Chromium local, comptes/projets synthétiques et fichiers importés via API. Mémoire mesurée avant travaux : 8 048 041 984 / 17 179 869 184 octets. pnpm 9.14.4, dépendances et lockfile inchangés. Requêtes runtime/génération et WebSocket bloquées dans le navigateur ; aucun workspace utilisateur démarré, aucune génération ou publication payante.

Le test `ide-floating-viewport.spec.ts` vérifie le confinement dès l’ouverture, une réduction réelle du canevas par la bibliothèque, les déplacements et agrandissements jusqu’aux bords, l’accessibilité des commandes Réancrer et Fermer, le contenu du document, les transitions 1440→768→390→1440, le changement de langue, une navigation desktop, un réancrage et un nouveau détachement/fermeture. Deux scénarios mobiles distincts vérifient langue française, menu existant, navigation et réouverture explicite du fichier.

Le premier outil exploratoire attendait à tort un cadre absent en mode mobile : son expiration est exclue de la preuve géométrique. La seconde exécution fournit les mesures rouges. Un parcours combinant toutes les navigations a atteint son budget global de 90 s ; il a été scindé en scénarios indépendants, sans prolonger les assertions. Une erreur de déclaration de fixture lors de cette extraction a été corrigée avant les exécutions finales.

## Limites ouvertes

La restauration automatique de la sélection mobile échoue après retour du tableau de bord à 768 px, et peut sélectionner README après un rechargement en français à 768/390 px : [fiche distincte](../bugs/BUG-IDE-MOBILE-RETOUR-SELECTION-001.md). Capture inspectée, contre-épreuve et trace conservées. Les scénarios d’accessibilité réouvrent systématiquement le fichier par le menu Fichiers ; ils ne valident pas cette restauration automatique et n’utilisent pas de fallback conditionnel.

Save, preview, runtime fonctionnel, génération et publication restent hors périmètre validé. Le contrôle responsive est réalisé dans Chromium aux dimensions indiquées, sans revendication iOS/Android natif ni test production. Le cas d’un parent inférieur à 280×180 est couvert unitairement, sans mesure navigateur correspondante. Les preuves locales complètes restent sous `/tmp/floating-viewport-evidence/`, y compris les traces d’échec ; les captures sélectionnées sont conservées dans le dépôt sans modification d’image.

## Résultats sur le correctif

- Build production remote-kubernetes réussi ; typecheck global (web et packages/services) et typecheck du nouveau fichier E2E réussis.
- Onze tests unitaires ciblés réussis : quatre gestes move/resize, y compris petit parent et arrêt après `pointercancel`, et sept tests i18n existants.
- Trois scénarios E2E finaux réussis, un worker, zéro retry : desktop 45,8 s, tablette 51,1 s, mobile 59,8 s (`verified.log`). Les scénarios mobiles réouvrent systématiquement le fichier après langue et navigation.
- Lint ciblé et format TS/TSX réussis ; `git diff --check` propre. Le contrôle Prettier du SCSS entier signale deux différences déjà présentes sur main (ligne vide vers 8075 et retour de ligne vers 23185), hors du correctif ; elles ne sont pas modifiées.
- Mesures après correction : à l’ouverture, cadre x=438,265625 et largeur=720, donc bord droit=1158,265625, identique à celui du canevas. Après réduction par la bibliothèque : largeur du canevas 682,28125 contre 761,265625 au départ ; cadre contenu. [Mesures complètes](mesures/flottant-2026-10-12/apres.json).

Captures finales inspectées : [ouverture](captures/flottant-2026-10-12/initial-1440.png), [bibliothèque agrandie](captures/flottant-2026-10-12/library-expanded.png), [redimensionnement aux bords](captures/flottant-2026-10-12/resized-to-edge.png), [restauration desktop en français](captures/flottant-2026-10-12/french-restored.png), [menu 768](captures/flottant-2026-10-12/mobile-menu-768-fr.png), [contenu après navigation 768](captures/flottant-2026-10-12/mobile-navigation-768-fr.png), [menu 390](captures/flottant-2026-10-12/mobile-menu-390-fr.png), [contenu après navigation 390](captures/flottant-2026-10-12/mobile-navigation-390-fr.png).

Deux répétitions supplémentaires du scénario desktop passent ensuite sans retry (environ 1,2 min puis 51,1 s, `repeated.log`), soit trois passages du scénario final et cinq exécutions finales ciblées au total. Aucun relâchement des assertions de confinement ni de contenu. Relecture indépendante favorable : code, périmètre, mesures, captures et distinction entre accessibilité et restauration automatique mobile.
