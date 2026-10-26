# Templates et Docs — recette locale 26 octobre 2026

Build consolidé local 10899 ; fixtures synthétiques, aucune authentification réelle. Aucun résultat production. Avant : build796 sur10799, preuves before10799. Après : after10899.

## Couverture exécutée
- 32 géométries : /templates et /docs, FR/EN, clair/sombre, 320/390/768/1440 ×900.
- 56 géométries supplémentaires : mêmes routes/langues/thèmes, 360×900,844×390,820×900,1024×900,1280×900,1920×1080,2560×1440.
- 4 zooms natifs200% : deux routes FR/EN clair, fenêtre1280×900, innerWidth640, devicePixelRatio2, visualViewport.scale1. Pas de zoom sombre.
- 8 groupes interactions : recherche sans résultat/réinitialisation/filtre clavier/Tab/Escape/resize/Retour Templates ; première ancre clavier/Escape/resize/Retour Docs. Ces interactions ne sont pas répétées sur les11formats.
- 4 ouvertures réellement froides du fragment Docs, contexte neuf, FR/EN clair/sombre320.

## Résultats et limites
88 géométries et4zooms : aucun débordement HTML détecté dans main. Douze cartes Templates restent contenues ; aucune action/étiquette supprimée. Docs a un h1 et8sections h2 ; captions descriptives d'illustrations, sans instructions développeur. Titres calculés : h1=24px, prérequis=16px, sections=20px. FR320 premier titre de section sur2lignes, sans débordement. Pas de comparaison pixel exhaustive ni validation lecteur d'écran/contraste/backend. Inspection visuelle ciblée TemplatesEN320 et DocsFRaprèsresize.

Ancres clavier320 : titre169px FR/168px EN sous header111px. Après resize, le navigateur conserve son scroll et le titre peut sortir du viewport ; aucun maintien automatique de l'ancre revendiqué.

**Défaut restant reproduit : hash froid Docs ignoré.** cold.json : scrollY0, cible absenteSSR, top1313FR/1213EN hors viewport900. Proposition docs.tsx seule dans proposed-docs-ssr.patch : import direct shellSSR existante et handle serverRenderedMarketing. Non appliquée à cette phase.

La propriété coldHash du receipt initial décrit une navigation dans la même page déjà montée et NE constitue PAS une preuve froide ; seule cold.json correspond aux4contextes neufs. Première tentative arrêtée après4géométries sur course du harness filtreURL/logo ; brut conservé attempt1. Attente explicite de l'URLdufiltre ajoutée, reprise32+8réussie. Aucun retry produit caché.

Aucune mutation tentée ni erreurJavaScript dans receipt/extra. Toutes requêtes nonGET et tiers bloquées. Erreur503 synthétique de10799 hors correction (voir before10799) ; pas retestée comme corrigée. Browsers fermés via finally ; serveur10899 appartient au parent, non arrêté ici.

## Delta SSR appliqué après cette recette

Autorisation parent : docs.tsx seul utilise désormais EcodeExactPublicShell et le handle serverRenderedMarketing reconnu par root. Aucun root modifié. 17 tests existants Docs/SEO réussis ; lint ciblé final0 après tri des imports, Prettiercheck0. La proposition est appliquée ; la preuve10899 reste AVANT ce deltaSSR. Recette ciblée11099 préparée :16contextes froids FR/EN clair/sombre320/1440, première/dernière section et Retour. En attente du build parent, aucun résultat11099 revendiqué.

## Verdict final11099

Recette ciblée terminée :16ouvertures froides SSR +16Retours passent, deuxzooms natifs200% FR/ENclair passent. Voir after11099/README.md et reçus. Le défaut froid démontré sur10899 est corrigé dans le build local11099. Pas de qualification production.
