# Parcours publics — preuves locales par build

Base avant : PR #792 `71d080c9c`, build local 7499, API isolée 3699 renvoyant 503. Aucun compte connecté. Toutes les mutations et requêtes tierces sont bloquées dans le navigateur. Les routes `/`, `/pricing`, `/login` et `/signup` existent ; `/register` réexporte Signup et n’est pas compté comme cinquième parcours.

## Défauts et corrections

- À 320 px, le bouton de menu de 44 px avait son bord droit à 351,8 px dans un document de 320 px. Le débordement était masqué. Le header peut désormais revenir à la ligne, en conservant le logo, les fonctions et les cibles tactiles.
- Échap et Fermer ne restauraient pas le focus au déclencheur. Ce retour est maintenant explicite.
- Ouvrir à 320 px puis redimensionner à 1440 px cachait le dialogue par CSS tout en laissant son état ouvert, le corps verrouillé, `pointer-events:none` et les autres éléments masqués pour l’accessibilité. Le menu ferme maintenant au breakpoint 1280 px et focalise Connexion, qui reste visible.
- La carte Comparaisons occupait une seule des deux colonnes du footer à 320 px : 132 × 596 px, texte sur 82 px. Aucun bouton ne dépassait le bord de la carte ; aucune coupure ou collision n’a été affirmée. Le problème était la lisibilité et la hauteur inutile. Une classe `col-span-2` donne 288 × 386 px. Les 46 liens restent présents avec leurs destinations et libellés exacts.
- La revue complémentaire a relevé une régression RTL de la marge physique ajoutée au header : en arabe à 1440 px, les actions étaient déplacées de x112 à x367. `ms-auto`, déjà pris en charge par UnoCSS, remplace cette marge par `margin-inline-start:auto`. La recette finale retrouve x112 sur desktop et x16 sur mobile, sans changer le comportement FR/EN.

Aucun composant Dialog partagé, style global, traitement métier ou fonction de navigation n’a été retiré ou réécrit.

## Matrice par version compilée

| Build local | Périmètre et nombre exact | Résultat |
| --- | --- | --- |
| 7499, avant | 80 observations : quatre routes × 320/390/paysage 844 × 390/820/1440 × FR/EN × clair/sombre | Défauts reproduits ; aucune erreur JavaScript. Quatre parcours de formulaires conservent la saisie pendant resize et focalisent l’email natif invalide. |
| 7799, trois correctifs du header | 176 observations : quatre routes × onze formats × FR/EN × clair/sombre ; 16 cas de zoom natif 200 % | Header et document contenus. Échap/Fermer, resize 1279→1280 et 320→1440 libèrent le corps et restaurent un focus visible. Quatre parcours Login/Signup et deux parcours Tarifs/Accueil/Retour corrigés passent. Cette phase précède la correction du footer. |
| 7899, footer corrigé | 88 observations : Accueil/Tarifs × onze formats × FR/EN × clair/sombre ; huit zooms natifs | Carte sur toute la largeur de sa grille, textes et liens contenus ; liste des 46 liens comparée à la base dans chaque cas. Menus, navigation Retour et accès au dernier bouton en paysage 844 × 390 par Tab passent. Captures rapprochées du header et de la carte à 320 px inspectées. |
| 8299, marge logique finale | 24 observations : Accueil/Tarifs × FR/EN/AR × 320/1440 × clair/sombre ; six groupes de menus | Alignement logique contre le bord attendu, contrôles contenus. Échap/Fermer restaurent le déclencheur ; les deux transitions de largeur ferment le menu, libèrent le corps et focalisent Connexion. Zéro erreur JavaScript et zéro mutation tentée. Navigateurs fermés après la recette. |

Les onze formats sont 320, 360, 390, paysage 844 × 390, 768, 820, 1024, 1280, 1440, 1920 et 2560 px. Le zoom est celui du navigateur Chromium : fenêtre physique 1280 px, largeur CSS 640 px, DPR 2 et `visualViewport.scale=1`, dans un profil éphémère. Ce n’est pas une simulation par `deviceScaleFactor` ou pinch.

Les preuves ne sont pas additionnées comme autant de parcours différents. Login/Signup restent couverts par 7799 : les changements ultérieurs concernent uniquement le footer et la marge du shell marketing. Les empreintes finales de source correspondent aux fichiers gelés avant le build 8299. Le contrôle AR est ciblé ; il ne certifie pas toute l’interface en arabe.

## Tests et diagnostics conservés

Huit tests de composant uniques passent : quatre nouveaux tests de menu et quatre existants. Avant correction, trois nouveaux tests échouaient et un passait. Les quatre tests existants pertinents ont été rejoués après le changement de footer. Lint ciblé vert. Les logs normalisent uniquement les espaces finaux.

Le premier sélecteur de harness `button[aria-pressed]` était trop générique : il touchait la langue au lieu de la périodicité. Une tentative PATCH `/api/user/preferences` a été interceptée et annulée avant accès au serveur. Le verdict initial du toggle a été retiré. Les passages avant/après ont été rejoués en ciblant les deux boutons de périodicité dans `main`, avec vérification de leur état canonique, puis Accueil/Retour. Ces passages conclusifs ont `mutations=[]`. Les reçus bruts exclus restent dans `harness-diagnostic/` ; ils ne démontrent pas le changement de périodicité et ne sont pas comptés comme validations supplémentaires.

Les contre-épreuves CSS temporaires restent séparées dans `footer-diagnostic/` et `rtl-diagnostic/`. Les boutons de démos hors du viewport Accueil appartiennent à une bande `overflow-x:auto` volontaire ; ils ne sont pas assimilés au débordement du bouton de menu.

## Limites et reproduction

Les scripts utilisent Playwright et Chromium locaux, une URL de build explicite et les données publiques/synthétiques décrites. Le harness final `after8299-logical/audit.cjs` requiert `UI_BASE_URL` ; il écrit dans `/tmp/ui-public-logical`. Exécuter depuis le dépôt avec `NODE_PATH=$PWD/node_modules`. Les autres scripts gardent leurs destinations temporaires documentées dans leur code. Aucune mutation autorisée par ces harness.

Pas de recette production, authentification réelle, soumission valide de Login/Signup, achat, accès OAuth, backend réel, Safari/Firefox, écran physique, clavier OS, safe areas ou lecteur d’écran. Les autres pages marketing ne sont pas couvertes. Le travail est validé localement sur les périmètres ci-dessus ; aucune fusion ni livraison production n’est revendiquée par ce dossier.

## Mesure de contraste complémentaire

[Calcul sur le build8799](contrast8799/README.md) :16cas FR320/1440, clair/sombre,612échantillons retenus et432exclus, minimum5,1784:1, aucun rouge. Ce résultat porte uniquement sur les fonds opaques simples explicitement retenus dans le contenu initial ; les zones de glow/translucidité, les calques incertains, header/footer et sections différées non montées ne sont pas certifiés. Aucune inspection visuelle n’est présentée comme une mesure de contraste.


## Complément final de contraste après défilement (8999)

Voir [le relevé body complet](contrast8999-body/README.md) : 16 cas FR320/1440 clair/sombre, neuf sections différées Accueil montées, header/footer inclus. 1 334 échantillons mesurés, 982 exclus, minimum 4,7975:1, aucun échec retenu. Les 612 mesures initiales restent une phase distincte. Fonds incertains et états non mesurés explicitement exclus ; aucune certification générale ou production. Aucun changement produit ; navigateur fermé.
