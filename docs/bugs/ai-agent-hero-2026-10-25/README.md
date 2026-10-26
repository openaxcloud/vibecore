# Audit majeur — build local org sur9999, lecture seule

Deux routes présentes : `/ai-agent` → EcodeExactProductMarketingPages.EcodeAiAgentPage → pages/AIAgent.tsx ; `/enterprise` → EcodeMarketingPages.MarketingStaticPage avec solutionPages.enterprise. Ne pas confondre avec `/solutions/enterprise`, non testé.

Serveur unique lancé pour cette recette depuis le build org existant, sans build/install. API3699 existante, aucune session réelle. Aucune source/branche/index modifié. Le serveur9999 a ensuite été arrêté (processus propriétaire identifié), session terminée ; connexion9999 refusée confirmée. Tous les navigateurs fermés. API fixture conservée.

## Matrice exacte

- 32 géométries :2routes ×320/390/768/1440 ×FR/EN ×clair/sombre, hauteur900.
- 8parcours communs :2routes ×FR/EN ×clair/sombre. Focus premier lien de main, Tab puisShift+Tab, focus conservé320→1440→390, logo versAccueil puisRetour retrouve route et h1.
- 4parcours Agent supplémentaires :FR/EN ×clair/sombre à320, ancre démonstration interne, sélection de chaque capture au Space (aria-pressed exclusif), URLimage changée, dernierchoix etfocus conservés au resize1440.
- 2contrepreuves DOM Agent FR320 clair/sombre, styles temporaires seulement, sans fichier source modifié.

Reçus receipt.json et agent-demo.json : erreursJavaScript=[] et mutations=[]. Les captures sont une illustrationmarketing existante ; aucun moteur IA/IDE/backend réel n’est testé. Capture pleinepage320/1440 par langue/thème ; grosplans du hero avant/après. Inspection visuelle ciblée heroFR320clair et sélectiondémoFR320clair, sans prétendre lecturepixel de toutes les captures.

## Défaut confirmé : hero Agent FR320

Les deux actions « Ouvrir le studio de l’agent » et « Voir la démonstration en direct » s’étendent dex16 à342,67px dans le viewport320. Même largeur326,67px pour la colonne et sonimage ; section overflow-hidden, document.scrollWidth320. Le bord droit des boutons et du visuel est coupé malgré absence de scrollbar globale. Reproduit clair/sombre. Aucun contrôle équivalent horsviewport détecté à390/768/1440 ni enEN. Les deuxalertes restantes aux taillesinférieures sont des halos décoratifs positionnés à−24 et au-delàduviewport, pas des boutons/texte coupés.

Cause locale : grillehero sans piste explicite souslg, minimumintrinsèque des actions whitespace-nowrap et paddinghorizontal64px. Les textes FR dimensionnent la colonne au-delàde288px disponibles.

Contrepreuve hero-counterproof.json/cjs : piste mobile minmax(0,1fr), actions whitespace:normal,height:auto,min-height56px etpaddingvertical12px. Après500ms de stabilisation, boutons x16→304 dans les deuxthèmes, hauteurs56 et74px ; aucun descendanttextuel/action horsviewport, uniquement les deuxhalos décoratifs. Captures counterproof-hero-fr-*-320.png montrent texte/fonctions préservés. Ce sont des stylesDOM temporaires, pas un correctif compilé.

`proposed-agent-hero.patch` reste **non appliqué et non validé sur build**. Un seul fichier : app/components/marketing/ecode-exact/pages/AIAgent.tsx. Ajoutgrid-cols-1 auhero et styleslocaux de retouràlaligne/hauteurautoadaptée sur ses deuxactions. Pas de styleglobal, texte raccourci ou fonction retirée. Avant adoption : vérifier merge etclassescompilées, puis reprendre FR/EN320/390/768/1440 et contrôle clavier/ancres ; le patch ne justifie aucune livraison pour l’instant.

## Autres résultats et limites

Enterprise : aucun enfant de contenu horsviewport dans16géométries, parcoursclavier/Retour4groupes réussis. Pas de vérification de conversion commerciale, envoi, abonnement ou lienexterne. La sélectiondémoAgent possède déjà l’étatARIA et fonctionne au clavier : aucune correction proposée là-dessus. Les captures d’élément demo-button peuvent être chevauchées par l’en-têtefixed lors du cadrageautomatique ; elles ne prouvent pas àellesseules un défautdefocus.

Pas de zoom200%, paysage, texteutilisateur, contrastecalculé, lecteurécran réel, Firefox/Safari, clavier virtuel/safeareas physiques dans cettepasse. Les liensprofondsAgent froids et l’intégralitédesancres ne sont pasvalidés. Autresroutesmarketing exclues. Aucune validationproduction, authentification, appelIA réel ou mutation. Ne pas qualifier l’ensemble de la plateforme comme couvert.

Correction adoptée ensuite dans un worktree séparé. Le buildfinal et le typage réussissent ; la recette compilée après10099 et ses limites figurent dans after10099/README.md. Le premierbuild précède la correction de hauteurdesktop ; final-build.txt est la preuve retenue. Les journaux et propositions archivés sont normalisés pour espacesfinaux/ANSI ; hash du fichierproduit final dans validation/source-sha256.json. Aucun résultat production revendiqué.
