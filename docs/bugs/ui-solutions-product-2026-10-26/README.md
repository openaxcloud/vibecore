# Solutions et présentations produit : recette locale partielle

Le 26 octobre 2026, Chromium local sur le build commun `222495dda3f4688af53a1eaddff864d893d1dfa9`, serveur 13699 et API synthétique 6899. Aucun backend réel, aucune action métier, aucun téléchargement. Baseline sans correctif ; après revue parent, le delta de deux classes est appliqué localement dans le worktree isolé marketing-next, base7759cbcbd. Aucune recette compilée de ce delta encore exécutée. Main/live : non validés.

## Dénominateurs et preuves

30 IDs exacts : Solutions 11, présentations produit 19 (`routes-plan.json`). Ce ne sont pas 30 pages rendues : 28 contenus, un état dynamique 404 et un alias HTTP. Les 29 IDs rendus sont attestés par les matches React Router de chaque observation. Le resolver dynamique est aussi exercé via son alias court 308 ; studio est un alias 301 vers `/ai-agent`, sans recette de destination attribuée.

`receipt.json` : 1 276 observations géométriques = 29 états × 11 formats × FR/EN × clair/sombre. Formats : 320×900, 360×800, 390×844, 844×390, 768×1024, 820×1180, 1024×768, 1280×800, 1440×900, 1920×1080, 2560×1440. Ce sont des observations avec redimensionnements, pas 1 276 tests indépendants. Huit observations de contrats HTTP (deux contrats × quatre modes) et 32 groupes représentatifs clavier/Escape/Retour ; AI/Mobile comprennent un changement d’état local conservé pendant redimensionnement. Seize captures ciblées de la matrice, pas revue visuelle exhaustive de tous les pixels.

Résultats : aucun mauvais ID rendu, langue/thème inattendu, erreur JS ou dépassement de largeur du document détecté. 528 GET de polices Google bloqués ; aucune mutation tentée. Les polices externes ne sont donc pas validées. Ces résultats n’excluent pas les débordements internes : un défaut confirmé subsiste ci-dessous.

Le plan statique a été préparé sur `7759cbcbd` ; `source-comparison.json` vérifie les 64 sources/dépendances sur le build testé sans différence. `server-origin.json` contient le SHA256 du bundle et la provenance PID. `static-plan.md` conserve les hypothèses et familles initiales, pas un second résultat exécuté.

## Défaut confirmé et proposition non appliquée

`/marketing/deployments`, héros : à 1024 px les trois cartes font 146,9 px ; leurs titres ont environ 97 px disponibles. Le mot français déborde au-delà de la carte et rejoint la carte voisine. `diagnostic.json` et `diagnostic-_marketing_deployments-1024.png` conservent les bornes Range/cartes. Douze observations de la matrice ont un débordement interne sur cette route. Les deux observations Collaboration concernent un dépassement de padding à 768 FR, sans sortie de carte ni collision confirmée : pas de correction proposée pour ce seul signal.

`hero-counterproof.json` conserve huit contrepreuves de simple repli des mots : techniquement contenues mais cartes trop étroites, solution non retenue. `grid-counterproof.json` compare une grille adaptée au conteneur en 12 cas FR/EN clair × 320/768/1024/1280/1440/1920. Elle corrige le chevauchement à 1024 mais révèle un autre problème à 320 FR : le CTA documentation nowrap impose une largeur 369,8 px, masquée par overflow-hidden. La largeur du document seule ne prouve donc pas la visibilité du contenu.

`grid-minimal-counterproof.json` démontre les deux changements DOM locaux : grille `repeat(auto-fit, minmax(min(100%, 14rem), 1fr))` et CTA documentation `white-space: normal; height: auto; min-height: 44px`. Les 12 cas conservent les trois cartes, textes et tailles typographiques ; titres dans leurs bornes et dans le viewport. Grille 320 FR : 369,8→272 px ; cartes 1024 : 146,9→232,4 px, titres 97→182 px. `proposed-grid-not-applied.patch` est la proposition à revoir/compiler, pas un correctif validé sur build. `grid-complete-counterproof` conserve une étape exploratoire avec propriétés supplémentaires ensuite retirées. Certaines captures DOM peuvent contenir des effets d’apparition transitoires ; les assertions Range et géométriques restent distinctes d’une validation visuelle compilée.

## Limites

Couverture partielle uniquement. Pas de Safari/Firefox, appareil physique, clavier OS/virtuel, zoom navigateur, safe areas, contraste WCAG ou lecteur d’écran dans ce lot. Pas de formulaire envoyé, achat, contact commercial, téléchargement desktop, projet créé, aperçu runtime ni test backend réel. Les textes sont les copies FR/EN existantes ; pas tous les contenus futurs arbitrairement longs. Les liens externes, le moteur de déploiement et les fonctionnalités IDE sont exclus. Alias et état 404 ne prouvent pas toutes les destinations ou branches dynamiques. La proposition DOM doit recevoir revue, vérification des conflits PR, compilation et recette ciblée avant toute affirmation de correction.

## Nettoyage

`cleanup.json` revalide PID/startTicks/cmdline avant arrêt des seuls processus 199673 et 199671. Le port refusé est enregistré séparément de l’état réel du processus ; un zombie n’a plus de heap actif. Les navigateurs sont fermés par les blocs finally des harnesses. Aucun serveur d’un autre agent n’est arrêté.

Scripts, reçus, logs et captures sont archivés ici ; aucun index global modifié. Les fichiers `.log` ignorés par défaut sont inclus volontairement comme preuves.

## Application locale après revue

Revue parent favorable et contrôle32PR ouvertes sans chevauchement du fichier : listes complétées par pagination pour les trois PR dépassant100fichiers (`open-pr-files.json`, `pr-files-pagination.json`). Aucune modification de ces PR. Deux classes locales appliquées, sans navigation/actions/texte/typographie modifiés.

11tests existants passent (PublicDeployments i18n3 + marketing UX8), lint ciblé et Prettier passent via les binaires existants. Logs `*-direct.log`. Les tentatives initiales `pnpm exec` ont échoué avant exécution des contrôles : le pnpm système tente une installation automatique et échoue ENOENT `/home/agent/.local/share/pnpm`. Pas de nouvelle installation demandée ni réalisée ; aucun lockfile modifié. Pas de build/typecheck supplémentaire ici, consolidation parent prévue. La recette compilée devra mesurer les bornes du CTA, son texte et sa hauteur, ainsi que la grille à320FR et1024 ; les contrepreuves DOM ne la remplacent pas.

Archivage : fins de lignes des logs normalisées et espaces terminaux retirés ; contenu diagnostique conservé.
