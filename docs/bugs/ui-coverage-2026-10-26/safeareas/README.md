# Safe areas : simulation CDP disponible, diagnostic initial corrigé

Le premier diagnostic «capacité indisponible» était incorrect : le harness appelait Emulation.setSafeAreaInsets, méthode inexistante. L'échec est conservé dans probe.json et initial-diagnostic-superseded.md, mais ne démontre aucune limitation de Chromium. Aucun refus d'autorisation n'a eu lieu.

Preuve nouvelle locale : protocol.d.ts de Playwright1.59.1 déclare Emulation.setSafeAreaInsetsOverride. Cette méthode exacte réussit dans Chromium154.0.8037.57. override-probe.json confirme computedCSS env(safe-area-inset-top)=44px et bottom=34px. default-env.json conserve la mesure antérieure sans override (0px), qui n'est pas une preuve d'absence de support.

Le complément en cours utilise uniquement cette simulation CDP, sans installation, permission nouvelle ni modification produit. Il ne constitue pas un test iOS physique ou de clavier virtuel réel. Le changement de hauteur viewport pendant saisie est une simulation de redimensionnement, pas un clavier réel. Aucun zoom natif pendant saisie : ni pinch CDP ni viewport shrink ne le remplacent.

## Résultats de la simulation corrigée

Huit cas FR clair sur build10599/API5499 : Security etSwitcher ×320×900,390×844,844×390,820×1180. Portrait/tablette : top44,bottom34,left/right0. Paysage : top0,bottom21,left/right47. Valeurs computedCSS exactes dans les huit cas, document contenu et zéro erreurJavaScript. results.json contient mesures et bornes, huit captures accompagnent les résultats.

Chaque cas comprend un champ focalisé, brouillon non soumis, réduction de hauteur viewport de150px (plancher240), vérification focus/valeur puis restauration de hauteur et champ. Les quatre dialogues Switcher ferment avec Escape et rendent le focus au déclencheur. Cette manipulation n'est pas un vrai clavier virtuel. Une première mesure pendant animation de dialogue était prématurée (42–43px) ; elle est conservée dans initial-animation-measurements.json, puis huit cas ont été rejoués avec500ms de stabilisation. Les mesures définitives des champs sont44px.

Défaut simulé confirmé : les contrôles du header restent y5,5→49,5 alors que la zone sûre portrait commence ày44. En paysage, boutonMenu x21→65 traverse la limitegauche47 ; Notifications x779→823 dépasse la limitedroite797. Cela concerne les deux routes. Le bandeau ne consomme pas les insets simulés. Aucun changement shell effectué.

Le dialogue Switcher reste contenu dans la zone sûre pour les quatre formats. En paysage il occupe x162→682,y70,71→319,29, à l'intérieur de x47→797,y0→369 ; input44px. Security paysage après le cycle de resize garde son champ focalisé x43,y358→402 : il traverse la margegauche47 et dépasse le bas visible390. C'est une mesure de viewport simulé, pas la preuve d'un clavier réel; récupération par scroll non testée ici. Les autres contrôles ordinaires de page partiellement visibles en bas ne sont pas classés automatiquement comme défauts de safe-area.

Aucune navigation basse visible sur ces routes dans les huit cas (détection nav en bas et .bolt-mobile-tabbar) : couverture navbas non réalisée et absence signalée au parent, pas de verdict sur le composant IDE. Aucun autre thème/langue/navigateur/zoom ni matériel iOS testé.

Navigateurs fermés. Aucune source,index,commit,fixture,permission ou installation modifié. Serveur10599 conservé au parent. Le diagnostic initial d'indisponibilité est explicitement remplacé par ces résultats positifs de capacité et défauts ciblés de layout.

## Diagnostic complémentaire de récupération (build10599 inchangé)

recovery-followup.json conserve le scénario Security paysage844×390 après resize focalisé. Champ initial x43,y358→402. Deux gestes de molette (200 puis350px), dont un sur le formulaire, ne le déplacent pas. L'ancêtre BODY a clientHeight390,scrollHeight1137,scrollTop102 et overflow-y:hidden. Tab→ShiftTab donne y346→390, visible au bord du viewport mais toujours sous la limite sûre369. PageDown ne change rien. Un appel explicite scrollIntoView({block:'center'}) donne y173→217 ; cela démontre une récupération programmatique, pas une récupération utilisateur par défilement. Valeur et focus conservés, aucun enregistrement. Capture et logs disponibles. Ce problème n'est pas déclaré corrigé par le patchheader.

## Proposition header, puis application autorisée

proposed-header-only.patch ne modifie que la classe TopBar de SaaSLayout : hauteur56px+insettop, paddingtop correspondant, margeslatérales max(gouttière existante,inset). Aucune navigation réécrite, aucun composant modal ou corps de page changé. ContrepreuveDOM dans recovery-and-header.json/recovery-followup.json : portrait boutonsy49,5>=44, paysage contrôlesx47→797, desktopinsets0 hauteur56 et placements conservés. Ce n'est pas une recette compilée du patch.

Après accord explicite du parent, ce hunk seul a été appliqué dans /workspace/vibecore-ui-coverage, en conservant le repli de la description.31tests existants/3fichiers réussis (SaaSLayout20,Security7,Switcher4) etlint ciblé0. Source gelée : build/typage/recette compilée attendus auprès du parent. Pas de build/index/commit/push par cet agent.

## Pourquoi la navigation basse manque ici

AppShell dans SaaSLayout rend DesktopSidebar, MobileSidebarDrawer, TopBar puis contenu ; il n'instancie aucune barre de navigation basse. La barre historique visible dans le code est BaseChat.tsx vers10530, conditionnée par showMobileChrome, avec data-testid=mobile-bottom-navigation et classe bolt-mobile-replit-nav ; elle appartient à l'IDE, hors des pagesSecurity/Switcher. Son absence dans les huit cas est donc une différence de couverture entre ces surfaces, préexistante au correctifheader, et non une suppression de celui-ci. La demande historique de navigation basse mobile/tablette sur toute la plateforme n'est pas entièrement satisfaite sur ces routes. Rien n'est déclaré validé pour la barreIDE ; pas de changement à cette navigation réservée.

Tous les navigateurs des compléments ont été fermés ; serveur10599 laissé au parent comme demandé. AGENTS.md et implémentationSaaSLayout relus avant proposition.

### Diagnostic de cause en attente de serveur propre

Une sonde supplémentaire scroll-cause.cjs a été préparée pour inspecter les racines et règlesCSS appliquées, vérifier molette sur élémentpointé et PageDown hors input, puis comparer une contrepreuveDOM body overflow-y:auto. Sa première exécution au lancement du rebuild du parent n'a pas trouvé le champ : scroll-cause.json contient zéro observation. Ce n'est ni un résultat produit ni une preuve de correction. Aucun nouvel appel10599 effectué pendant le rebuild; reprise attendue sur serveur propre annoncé par le parent.

## Recette finale du header et cause du scroll

Voir after10999/README.md : huit safeareascompilés et32zéroinsets verts,16menusfocusEscape. Cause précise du scroll global identifiée et contreprouvée, patchsourceCSSproposé nonappliqué ici. Vraie routeIDE synthétique montée confirme présenceunionmarqueurs etpréservationverrou/navbas avec contrepreuveCSSOM. Tentative10899 échouée deconfigurationserveur conservée séparément, aucun backend atteint selon diagnosticparent.
