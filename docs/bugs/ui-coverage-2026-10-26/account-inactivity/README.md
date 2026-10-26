# Account inactivity — audit local ciblé

Recette sur build consolidé10899 de `/workspace/vibecore-ui-coverage` (HEAD1714415cb, changements consolidés non encore commités), autorisé/gelé par parent. Route publique `/account-inactivity`, locale via loader, aucune API métier ni action de suppression. Données : catalogue public FR/EN réel du code, aucun compte réel ou cookie vc_session. Requêtes nonGET et tierces bloquées ; aucun mailto activé. Fixture5499 partagée intacte.

## Recette exécutée

`audit.cjs`, `audit.txt`, `receipt.json` : **20 observations** =320×900,390×844,844×390 paysage,820×1180,1440×900 ×FR/EN×clair/sombre ; **4 groupes** focus mailto sans activation, resize320→844→390, Escape/Tab, logoAccueil→Back. Aucun champ dans main : pas de saisie prétendue. Zéro erreurJavaScript, zéro requête nonGET tentée, zéro débordement horizontal mesuré dans titres/paragraphes/liens, un h1 par cas. Back restaure URL/langue. Focus mailto conservé aprèsresize mais horsviewport en paysage (top852/872px) : aucune affirmation de focus visible. CaptureFRclair320 inspectée, contenu lisible ; captureFRsombre844 a révélé une grande zone vide, conduisant à la vérification interactive ci-dessous. Toutes les captures ne sont pas inspectées pixel par pixel.

## Défaut reproduit, pas corrigé

`scroll.cjs`/`scroll.json` : **4 contextes** FR/EN×thèmes à844×390. Molette600 au point500,280 puis PageDown ne changent ni scrollY ni body.scrollTop ; dernierh2 top744,75px reste horsviewport. HTML et BODY overflowY=hidden. `scrollIntoView` programmatique déplace BODY566px et expose ce h2 top178,75px. Ceci distingue le blocage réel de lecture d'un simple artefact fullPage. Aucun menu ouvert pendant ces mesures.

Cause : `app/styles/index.scss:23349`, `@media(max-height:499px)` contient `html, body { overflow:hidden; }` sans scope, dans un bloc IDE. `cause.json` conserve les règles correspondantes : le scope marketing pose overflow-x:clip, mais la règle de faible hauteur impose hidden aux deux axes. Le root porte `data-ecode-public-chrome=homepage`, `data-ecode-hydrated=true`, body seulement `h-full w-full` ; attributs complets dans `scoped-counterproof.json`.

`cause.cjs` contrepreuveDOM1 : BODY.style.overflowY=auto restaure bodyTop600 aprèsmolette, dernierh2top144,75. Aucun produit modifié.

`scoped-counterproof.cjs` contrepreuveDOM2 : remplace uniquement le sélecteur de cette règleCSSOM par un scope `.bolt-project-ide-shell` (proposition exploratoire, pas patch final). Molette→scrollY600 ; PageDown→941. Menu mobile Radix ouvert : bodyoverflowYhidden, data-scroll-locked=1, molette ne déplace pas le fond. Escape ferme le dialogue, enlève le verrou ; molette→scrollY600 à nouveau. Ce reçu est FRclair uniquement et ne prouve pas tous les dialogues ni la conservation IDE. Le choix définitif du sélecteur doit inclure le fallbackSSR et les variantes IDE pertinentes ; coordination ui_remaining pour proposition unique. Pas d'override public distinct ajouté.

## Limites et suivi

Défaut signalé au parent et à ui_remaining ; aucun sourcepatch, build, test CI, index, commit ou push dans cette mission. Les tests catalogue existants ont été lus, pas réexécutés. Aucune recette production/authentification/suppression/désactivation, aucun backend réel. Safari/Firefox, zoom200%, safeareas physiques, clavier OS et lecteurécran non testés. Pas de panneAPI artificielle car le loader ne dépend que de locale ; pas de conclusion sur récupération des autres routes. Après correctif commun autorisé, refaire la recette compilée de scroll/menu et préserver le verrou IDE avant verdict.

## Reproduction des scripts archivés

Depuis la racine du dépôt avec ses dépendances installées : `AUDIT_BASE=http://127.0.0.1:10899 node docs/bugs/ui-coverage-2026-10-26/account-inactivity/audit.cjs`. Les scripts diagnostiques scroll/cause/scoped-counterproof ciblent explicitement le serveur local10899 et écrivent dans leur dossier ; adapter cette constante pour un autre port. Ils ne démarrent ni serveur ni API. Les scripts utilisent createRequire(process.cwd()+package.json), aucun require absolu vers un autre worktree. Ne pas lancer contre un environnement réel.

Revue de proposition : union `html:has(.bolt-project-ide-shell, .bolt-responsive-ide)` et équivalent body protège la coque route SSR (projects.$projectId.ide.tsx:185, avant ClientOnly) et BaseChat monté/legacy (BaseChat.tsx:10150, classe non conditionnée par projectIdeMode). Elle remplace uniquement les deux sélecteurs de la règle max-height499, sans modifier overflow:hidden ni les autres règles. Aucun bloquant statique identifié. Le reçu DOM public utilise shell seul ; la proposition union finale et la recette compilée ne sont pas réputées exécutées par ce reçu. Preuve IDE réellement montée attendue séparément de ui_remaining.

## Complément de revue indépendante — IDE réellement monté

Le reçu [IDE union CSSOM](../safeareas/after10999/ide-selector-scoped-counterproof.json), produit séparément par ui_remaining et relu, constate un vrai montage de la route projet avec fixtureGET : bootShell1, projectShell1, responsiveIde1, sélecteurs HTML/BODY vrais. Une seule règle CSSOM remplacée par l'union proposée ; overflow root/body restent hidden et navigation basse844×390 reste top318/bottom390/hauteur72. Zéro erreurJS, tiers bloqués ; aucun élément IDE fabriqué pour faire matcher le sélecteur. Cela lève la réserve de montage réel pour ce seul cas, sans constituer recette IDE globale, validation fonctionnelle des outils ou build du correctif. Avis indépendant favorable à l'application du patch, puis validations compilées requises. La variante legacy est vérifiée statiquement, pas ouverte au navigateur dans ce reçu.

## Recette compilée après correction11099

[Complément ciblé après11099](after11099/README.md) désormais exécuté sur la vraie règleCSS compilée :4 groupes FR/EN×thèmes à844×390,8 gestes molette/PageDown mesurés, dernierparagraphe accessible, menuRadix lock/Escape/focus/reprise et Back passent. Aucun patchDOM. Les20 observations avant restent conservées, non refaites ni réétiquetées après. Focus mailto reste actif aprèsresize mais peut être horsécran/sousheader : limitation résiduelle explicite, pas verdictfocusvisible. Aucunmain/production validé par cette recette locale.
