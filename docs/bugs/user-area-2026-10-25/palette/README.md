# Palette : largeur des résultats

Après libération de `SaaSLayout.tsx` par la fusion #788, ajout local de `min-w-0` et `gap-2` au seul lien résultat, avec `shrink-0` sur l’indication Entrée. Le delta local ne change aucune route. Cette branche attend encore l’intégration de main : les routes #788 seront conservées pendant cette fusion. À 320 px, les résultats occupaient 1 317,656 px pour une listbox de 269 px ; ils sont désormais contenus dans 269 px.

Avant : build local 6199, fixtures synthétiques. Après : build final 6899, même API synthétique 3199. Matrice : 40 observations (Dashboard et page Palette × 320/360/390/820/1440 × FR/EN × clair/sombre), aucun résultat débordant et aucune erreur JavaScript. Huit groupes clavier : recherche longue, redimensionnement à 320, ArrowDown puis Entrée vers Projets récents. Échap conserve la recherche et la palette inline ; aucune fermeture modale n’est revendiquée. Les appels tiers, mutations et ouverture IDE sont bloqués par le harness.

`matrix.cjs` exige Playwright installé, Chromium `/usr/bin/chromium` et fixture locale documentée dans le dossier parent. Lancer depuis le dépôt avec `NODE_PATH=$PWD/node_modules UI_BASE_URL=http://127.0.0.1:6799 PHASE=after node .../matrix.cjs`. Il écrit dans `/tmp/account-next/palette`. Les captures `after-light-*` et `after-dark-*` proviennent de la matrice finale 6899 ; les captures `after-fr-*` plus anciennes n’attestent que le thème clair.

Les 40 observations sur 6899 valident également l’espacement final gap-2/shrink-0, inspecté dans les captures. La recette antérieure sur 6799 est conservée dans `after-min-width-6799.json` ; elle attestait min-w-0 seul. Build final réussi et 28 tests existants verts. Les routes Paiement, Offres, Notifications et Usage sont inchangées depuis leurs recettes 6799/6699.

Cette recette est locale. Aucun compte de production ni backend réel utilisé, aucun statut « testé live » de production.

Complément final 6899 : 48 observations supplémentaires sur paysage844×390,768,1024,1280,1920,2560, dans `extended.json`. Cumul géométrique : **88 observations, 11 formats**, aucun débordement des résultats ni erreur JavaScript. Les huit groupes clavier ont été rejoués ; ils ne deviennent pas seize parcours différents.

Les journaux texte archivés ont uniquement leurs espaces de fin de ligne et lignes vides finales normalisés ; les résultats sont inchangés.
