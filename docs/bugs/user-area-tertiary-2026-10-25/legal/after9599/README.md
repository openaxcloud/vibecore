# Validation locale après adoption —9599

Le patch légal a été adopté par le propriétaire dans vibecore-ui-org ; aucune source supplémentaire modifiée par cette recette. Build consolidé et typage annoncés réussis par le propriétaire avant GO9599. Les hash des quatre fichiers légaux sont consignés dans source-sha256.json. Le build inclut aussi quatre fichiers organisation hors de cette recette.

## Résultats

- 16 tests existants marketing-exact-privacy-terms.spec.tsx réussis (une suite, pas de tests dupliqués).
- Lint ciblé routes/privacy.tsx, routes/terms.tsx, pages/Privacy.tsx, pages/Terms.tsx : code0, aucun avertissement.
- 32 cas navigateur : Privacy/Terms ×FR/EN ×clair/sombre ×320/390/768/1440, hauteur900. La réponseHTML contient h1 et h2 cible avant JavaScript. Cible visible sous le header après chargement froid du fragment, changement de hash et logo→Accueil→Retour. Espace minimal titre/header32,875px, y compris après Retour. Aucun pageerror, erreur d’hydratation observée ni mutation tentée.
- 4 cas zoom natif200% : Privacy/Terms ×FR/EN, clair uniquement, fenêtre1280×900, viewportCSS640×406, DPR2, visualViewport.scale1. Ce n’est pas un pinch. Header réel65px, marge calculée144px, cibley143,75–144,125px et entièrement visible. ScrollWidth640, aucune erreurJavaScript ni mutation tentée.

Captures après à320/1440 (16 fichiers) et zoom (4fichiers). Inspection visuelle ciblée : Privacy FR clair320, Terms EN sombre1440 et Privacy FR zoom200. La comparaison avec samepage-anchor-privacy-320 avant montre le titre auparavant sous le header et maintenant visible. Les autres captures sont archivées, sans prétendre toutes inspectées pixel par pixel. Navigateurs fermés.

## Exécution et diagnostic

Le premier `pnpm exec` a échoué avant lancement des validations : wrapper tentant une vérification/install de dépendances et création de /home/agent/.local/share/pnpm inexistante. Diagnostics conservés dans adopted-unit.txt/adopted-lint.txt. Aucune installation requise ni faite. Les appels directs node_modules/.bin/vitest et eslint ont ensuite terminé code0 ; sorties dans les fichiers *-direct.txt.

Rejouer depuis le dépôt avec dépendances déjà présentes : `NODE_PATH=$PWD/node_modules UI_BASE_URL=http://127.0.0.1:9599 node chemin/acceptance-after-build.cjs`, puis zoom-after-build.cjs. Scripts exigent URL locale, bloquent méthodes autres queGET et requêtes tierces, écrivent dans /tmp/ui-audit-next-legal (créer avant). Profils zoom temporaires non archivés.

## Limites

Les recettes8999 restent le diagnostic avant. Les32cas ne sont pas une certification de tous les fragments : le point de contact de chaque document sert de régression ; tous les h2 reçoivent la même marge. Zoom sombre, zoom à d’autres fenêtres physiques, annonce personnalisée future, JavaScript désactivé, Firefox/Safari et clavier virtuel/safeareas physiques non testés. SSR réel vérifié par réponseHTML, sans nouvelle mesure de contraste. Aucun backend réel, compte, envoi de message ou production. Support-policy n’est pas modifiée ; sa géométrie/clavier/Retour étaient couverts dans la phase8999, ses fragments restent non conclusifs. /legal et autres documents légaux restent hors périmètre. Aucune fusion ni livraison production effectuée par cet agent.
