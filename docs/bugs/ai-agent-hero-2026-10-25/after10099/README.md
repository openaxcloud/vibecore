# Recette compilée finale Agent —10099

Build final incluant md:min-h-14 et formatage annoncé réussi par le propriétaire, typage final également. Source gelée dans vibecore-ui-major ; hash du fichier adopté archivé. Aucune modification source supplémentaire pendant cette recette.

## Résultats

- 4 tests existants marketing-exact-ai.spec.tsx réussis. Une première exécution avait aussi passé ces mêmes tests : ne pas les compter deux fois.
- Lint final du fichier AIAgent.tsx code0. L’échec initial de formatage Prettier sur les props du Button outline est conservé comme diagnostic ; corrigé par le propriétaire avant build final.
- 16 cas géométrie Agent : FR/EN ×clair/sombre ×320/390/768/1440, hauteur900. Deux CTA contenus dans le viewport et libellés complets vérifiés exactement dans chaque cas. Le seul dépassement restant aux petites tailles concerne les deux halos décoratifs positionnés, aucun contrôle/textuel du hero.
- 4 parcours clavier/Retour : FR/EN ×clair/sombre, focus sur premier lien, Tab/Shift+Tab, focus conservé320→1440→390, logo→Accueil→Retour.
- 4 groupes de démonstration : FR/EN ×clair/sombre, sélection de chaque capture au Space, exactement une sélection ARIA active, image correspondante changée, dernière sélection et focus conservés à1440.
- Aucun pageerror ni mutation tentée dans les deux reçus. Les navigateurs sont fermés ; le serveur10099 reste au propriétaire pour arrêt coordonné.

## Hauteurs et preuve du correctif

FR320 clair/sombre : actions x16→304 (avant :x16→342,67), hauteurs56/74px, textes intacts. La seconde action revient sur deux lignes au lieu d’être coupée. Capture after-hero-fr-light-320.png inspectée visuellement : bordures, icônes et libellés entièrement visibles.

Le reçu consigne rootFontSize, minHeight et référence h14=3,5rem pour chaque bouton. Sur CE build et CES cas, rootFontSize vaut16px, donc h14=56px. À768 les CTA FR mesurent56px ; à1440 ils mesurent74px lorsqu’ils reviennent à la ligne, donc restent au-dessus du minimum original. Toutes les langues/thèmes satisfont hauteur>=3,5rem. Ce résultat ne prétend pas que h14 vaut universellement56px : à racine12px il vaudrait42px ; ce scénario n’a pas été observé ici.

## Preuves et limites

Reçus after-receipt.json et after-agent-demo.json, captures, scripts, logs code0 et hash source. Pour rejouer depuis un dépôt avec dépendances : `NODE_PATH=$PWD/node_modules UI_BASE_URL=http://127.0.0.1:10099 node chemin/after-audit.cjs` puis after-agent-demo.cjs. Scripts limités aux URLlocales, mutations et tiers bloqués, sortie dans /tmp/ui-audit-next-major (créer avant).

Pas d’autre page testée sur10099 ; Enterprise reste la recette avant9999. Pas de zoom200%, paysage, contraste calculé, lecteurécran réel, Safari/Firefox ni clavier virtuel/safeareas physiques. La démonstration est un sélecteur d’images existant : aucune exécution IA/IDE réelle revendiquée. Pas d’authentification, abonnement, envoi, backend réel ou production. Aucun commit/push/fusion par cet agent ; aucune livraison production revendiquée.
