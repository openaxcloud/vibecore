# Grille Observabilité MarketingDeployments

Cause reproduite par public_ui_audit sur le build `cc5574d67`, source équivalente à la base `279440d2f` de ce worktree. `source-build.json` conserve la provenance ; `diagnostic.json` et les quatre captures sont des preuves copiées de son audit, pas une nouvelle recette exécutée par cet agent.

À largeur CSS 320, zoom navigateur 100 % et 200 %, une colonne implicite mesure 320,53 px dans une grille de 272 px. Le paragraphe atteint x337,77 et est coupé malgré documentWidth320. Contrepreuve DOM : `grid-template-columns:minmax(0,1fr)` ramène le Range à x276,21 et ne laisse aucun descendant hors viewport dans ces deux cas. Ce diagnostic ne valide pas encore le correctif compilé.

Correction : ajouter seulement `grid-cols-1` au conteneur Observabilité dans PublicDeploymentsSections.tsx. La grille desktop `lg:grid-cols-[1.2fr_1fr]` reste inchangée ; aucun texte, CTA, route, donnée ou style global modifié.

32 PR ouvertes vérifiées. Seul chevauchement : notre #802, tête `279440d2f` identique à la base avant patch (`pr802-source-comparison.json`). Sa tête publiée et son worktree restent intacts ; tous ses changements sémantiques sont conservés dans cette branche locale.

11 tests existants passent : PublicDeployments i18n3 et marketing UX8. Lint et Prettier ciblés passent ; logs conservés avec fins de lignes normalisées et espaces terminaux retirés. Aucun nouveau test miroir CSS, build autonome, index ou push.

Revue indépendante final_review favorable : la piste explicite corrige précisément le minimum intrinsèque observé sans toucher le renderer partagé. Réserve pour le build commun : vérifier paragraphes et éléments internes à CSS320, zoom100/200, FR/EN ; vérifier aussi les deux colonnes à partir de lg. Une piste rétrécie peut révéler d’autres minimums internes. Main/live restent faux ; pas de validation globale de la page ou des autres routes.
