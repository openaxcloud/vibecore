# Recette compilée du verrou de scroll — 11099

Build final fourni par le parent, serveur11099/API5499 synthétique. Aucun style correctif injecté dans cette recette. Empreintes source/build dans source-build.sha256. Le parent gère le PID153695 ; cet agent n'a arrêté aucun serveur.

## Security paysage et safe areas

Viewport844×390, simulationCDP left/right47,bottom21,top0. computed styles HTML/BODY overflow-y:visible sur la vraie page Security. Molette : document scrollTop0→200, champ y460→504 devient260→304. PageDown avecBODYfocalisé : scrollTop200→541. Cela confirme le défilement utilisateur rétabli, contrairement à la contrepreuveDOM précédente.

Après saisie d'un brouillon, focus et cycle de hauteur390→240→390 : champy358→402, scrollTop102. Molette150px ramène champy208→252, scrollTop252. Valeur etfocus conservés ; champ ensuite vidé. Champ44px, bas252 au-dessus de la limite sûre369. Aucun enregistrement.

Limite horizontale explicite : champx43 alors que l'insetgauche simulé vaut47, soit4px dans la marge. Le correctif safe-area portait sur l'en-tête, pas sur tout le corps de page. Les contrôles du header restent x>=47 etright<=797 aprèsdéfilement. Aucun résultat hardware/claviervirtuel réel.

Switcher : dialogue dans la zone sûre (x162→682,y70,71→319,29), fermetureEscape rend le focus au vrai bouton. compiled.json contient étapes, positions etassertions ; deuxcaptures. Zéro erreurJS.

## Préservation de l'IDE

Vraie route GET /projects/synthetic-safearea-project/ide, fixture locale, aucune création. Shellprojet1, responsiveIDE1, sélecteurunionmatchHTML/BODY. Verrouroot/bodyhidden conservé avecCSScompilé. Navigationbasse réelle visible à844×390 : y318→390,width844,height72. ide-selector.json et capture. Aucun élémentDOMIDEinjecté ; aucune modificationCSSOM pour ce résultat.

Première mesure a rencontré un rerender entre l'attente de visibilité et querySelector dans page.evaluate ; reçu initial conservé dans ide-selector-initial-harness-race.json. Capture initiale montre la nav. Harness corrigé par locator.evaluate, puis preuve réussie ci-dessus. Aucune erreurJavaScript produit. Fixture partielle : conversations/mémoireIDE non configurées peuvent afficher des états d'erreur ; ce test valide shell/verrou/nav, pas ces fonctions.

Tiers (dontStackBlitz), mutations etWebSocket bloqués, serviceworkersbloqués. Aucun runtimebackend réel ni publication/client/DNS/secret.

## Route historique et limites

GET /chat/synthetic-safearea-legacy retourne302 Location:/, sanssuivre la redirection (legacy-route-headers.txt). Conforme à app/routes/chat.$id.tsx. Cette route n'expose donc pas un ancienIDE testable dans ce parcours ; aucune validationinteractivelegacy revendiquée. L'union des marqueurs conserve sa couverture statique BaseChat existante.

Header8safeareas+32zéroinsets déjà validés sur10999, non rejoués exhaustivement. Cette recette ne remplace pas leurs versions. Touslesnavigateursfermés, aucune source/index/commit modifiés ; aucune mutationAPI effectuée.
