# Secrets petite hauteur — diagnostic et delta local

Base3c61ac84e (#844), serveur21999parent, Chromium natif100/200%, fixtureAPIclé synthétique longue, aucun secret réel/copie/révélation/soumission. AGENTS lu ; skill commit-helper seul présent non applicable (pas commit). Aucun serveur démarré/arrêté par cet agent.

## Mécanisme établi
`baseline/receipt.json` et `baseline-wheel/receipt.json` diagnostiques (leur `pass` indique fin de collecte, PAS acceptation visibilité) : service mobile fixed bottom0, scroller descend au basviewport, navfixed72px recouvrebas. Paddingbottom88–97.6 réserve le scroll final mais scrollpadding16–25.6 ne représente pas la zone réellement masquée.
- 390×320@100% : CSS390×320, scrollerY48/H272, navY248, clé154→186 accessible.
- 390×320@200% : CSS195×160, scrollerY48/H112/max155, navY88 ; focus scrollTop107 mais clé88.23→120.23 recouverte parRun.
- 820×400FR@200% : CSS410×200, scrollerH152/max74, navY128 ; focus clé151.5→183.5 recouverte.
- 1280×400EN@200% : CSS640×200, scrollerH152/max91, navY128 ; focus clé142.26→174.26 recouverte.
Tab natif depuis filtre reste occulté. scrollIntoViewIfNeeded ne bouge pas car l'élément est considéré visible dans le scrollport derrièrenav. Roulette60 physique donne30CSS à200% et peut déplacer contenu sans garantirdégagement ; mesures exactes dans baseline-wheel. F1premierfocus échoue quand scroll ferme infobulle, secondTabF1 réussit même sousnav : comportementtooltip distinct, pas de modification ici.

## Comparaisons CSS temporaires, pas build corrigé
`counter-height` : réduire seulement serviceheight parnav échoue, paddingvertical102–119 impose boîte minimale plus grande que40/80disponibles, peut entraînerscrollancêtres (y48→-2). Hypothèse rejetée.
`counter-bounded` : mêmeheight +paddingblock4/scrollpaddingblock4 rendTabnatif4/4clés accessibles parhit-test. CSS195×160 scrollerY48/H40/bottom88=navtop, clé52.23→84.23. CSS410/640×200 scrollerH80/bottom128, clé90→122. Focusprogrammatiqueinitial410/640 n'était pas encore déplacé dans cette injectionCSS : preuve compilée nécessaire.

## Delta local stable autorisé
`app/styles/index.scss`, seul bloc marqué Secrets short-height scrollport : media maxheight450, ciblage `.bolt-responsive-ide-mobile .bolt-workbench-mobile-service .bolt-project-service-panel[data-panel='secrets']`, uniquement html:not(data-vc-clavier=ouvert). Serviceheight calc100%-mobile-nav-height-safearea, enfant.min-h-0 paddingblock4important, scrollpaddingblock4. Nav/header/taillecontrôles/handlers inchangés. Clavierouvert exclu car navdéjàmasquée etexistingwrapperbottom suit visualviewport.
Nouveau `app/styles/secrets-short-height.spec.ts` :1rougeavant/1vertaprès, lint0erreur, diffcheckvert. Teststructurel seulement ; pas preuve géométrie.

## Limites et suite
Build/typage/recettecompilée/revue indépendante à la charge parent avantvalidation. À160CSS, header48+nav72 laissent40px : unecible44px ne peutpasêtreentièrement visible ; aucune réduction decontrôles et aucune certificationaccessibilitéglobale. Safearea/virtualkeyboard contract àtester séparément ; pasSafari/appareilphysique. Aucun déploiement/PR/mutation autorisation. Tous navigateursfermés etseulsprofilstestscréés ici supprimés.

## Build corrigé — recette compilée finale
Serveurparent ui845-short-height-compiled, aucune CSS injectée.
- `compiled-acceptance-harness-fixed/receipt.json` :4/4verts, mêmes quatreformats ; nativeTab depuisfiltre, clé réelle entièrementdansscroller, scrollerbottom≤navtop, hit-testcentre etclicktrial sanscopie. Avantcela `compiled-acceptance` conserve4ReferenceErrorharnais (variablelocale targetmasquaitconstexterne) avantobservations ; correctionnomvariableuniquement, pas assertionproduit.
- `compiled-boundary-keyboard-settled/receipt.json` :3/3verts, CSS410×450/410×451/195×320. Frontière450activée/451désactivée ; brouillonfiltre ETfocus conservés pendantresizeallerretour ; menuclavierEscape restaurefocus. ClavierHTMLSIMULÉ viaattributexistant+inset40 : navmasquée, serviceheight=wrapperheight, wrapperbottom=viewport-40 ; fermeture revientsansdoublerinset. Pas declavierphysique.
- `compiled-boundary-keyboard-draft` conserve1vert/2échecs de mesureimmédiate pendanttransition. Computedtransition prouvée `flex-basis,width,height`0.25s ; attenteparassertionexpect.pollbudget5sexistant rendbornesexactes, aucunseuilélargi.
- `compiled-capture-help/820-fr-200-focus-after.jpg` captureaprès vraieclé focalisée, comparaisonavant `/workspace/ui844-tall-help-independent/compiled-real-secret-anchor/820-fr-2x-failure.png`.

## Limite aide supplémentaire non masquée
`compiled-capture-help/receipt.json` : acceptancegéométrieclévisible réussie puis actionLireabsenteaprèsnouveaufiltre→Tab, timeout5s. F1/End/Escape nonatteints surcetessai, aucune reprise. Le passagefocusentraînepotentiellementscrollqui fermeinfobulle, maiscauseexactedececascapturenonisolée. Ne pas présenterl'aide entièrementvalidée aveccecorrectifCSS. Le défautd'occlusionetlesmenusEscape sont couvertsparrecettesséparéesci-dessus.

Tousnavigateursfermés, profilsTESTcréésparcetagent supprimés. Aucunesecret/copie/révélation/soumissionréelle. Reviewerparentpeutinspectercaptureetsources avantpublication.
