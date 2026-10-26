# Observabilité Deployments — recette compilée finale

26 octobre 2026. Build commun **c3404050d2**, réutilisé depuis admin-redirect-next, servi sur14199 avec API7099 synthétique gérée par ui_remaining. Le hash du bundle calculé correspond exactement à sa provenance serveur (`source-build.json`). Aucun build supplémentaire, changement source, injection DOM, index ou publication par cette recette.

## Périmètre et méthode

Une seule URL : `/marketing/deployments`, section observabilité. FR/EN, clair/sombre, CSS320/1024/1440 à100% et200% : **24 observations**. Zoom natif `chrome.settingsPrivate.setDefaultZoom`, jamais CSSzoom ni pinch. DPR1/2 et visualViewport.scale1 sont relevés dans chaque cas.

Les dimensions de fenêtre et de viewport sont distinctes. À100%, CSS320 correspond ici à une demande de fenêtre320 avec outerWidth520 réellement relevé ; à200%, CSS320 correspond à une fenêtre640. Les largeursCSS1024/1440 correspondent aux demandes1024/1440 à100%,2048/2880 à200%. La hauteur CSS est813 à100% et406 à200%. Ces mesures ne décrivent pas un appareil mobile physique.

## Résultats

- **24/24** : titre et paragraphe dans leurs bornes, fragments Range contenus, aucun descendant de cette section hors viewport.
- À320CSS, grille **272px**, titre terminé àx296 et Range du paragraphe français àx276,22 environ, aux deux zooms. Avant correction, la grille implicite atteignait320,53px et la Range du paragraphe337,77px, coupée dans le viewport320.
- À1024 et1440CSS, les **deux colonnes** de la règle lg restent présentes et contenues. La recette ne déduit pas le reflow des seules classes.
- **4/4 groupes clavier** à200%/CSS320 : focus du lien Documentation, Escape conserve ce focus, Enter ouvre `/docs`, Retour restaure l'URL `/marketing/deployments`.
- Aucune assertion en échec, aucune erreur JS, **aucune tentative nonGET**.48 requêtes Google Fonts ont été bloquées : rendu avec polices locales de repli, pas validation des fontes externes.

Les captures `*-100-css320-cdp.png` et `*-200-css320-cdp.png` proviennent du build réel, sans manipulation du DOM. Le diagnostic avant et la contrepreuve DOM restent sous `/tmp/ui-p2-native-zoom` et seront archivés séparément ; ils ne remplacent pas cette preuve compilée.

## Limites et distinction des lots

Le correctif concerne uniquement la grille observabilité. Les autres débordements mesurés au viewport extrêmeCSS195 lors du lot précédent restent dans le backlog et ne sont pas rejoués ni déclarés corrigés ici. Aucun nouveau ID de route couvert ; les24 observations ne sont pas24 parcours complets. Pas de contrôle de toutes les sections de Deployments, de recette IDE/runtime, de formulaire, de compte, de vrai backend, d'email, de téléchargement, de permission ou de donnée réelle.

Pas de WebKit/Firefox, appareil physique, clavier virtuel matériel, lecteur d'écran, mesure de contraste ou production. Le parcours docs vérifie la navigation et le Retour, pas toutes les fonctions du hub.

## Nettoyage et archivage

Tous les navigateurs sont fermés, profils temporaires supprimés ; les quatre PID Chromium principaux de la recette sont absents de `/proc` (`browser-cleanup.json`). Le serveur et l'API sont la propriété de ui_remaining. Son reçu `shared-server-cleanup.json` indique les ports refusés et les PID en état zombie Z sans RSS/cmdline : aucun serveur actif, mais ne pas prétendre que les entrées PID ont disparu.

Aucun processus tiers terminé par cette recette. ui_remaining conserve la responsabilité du seul commit documentaire, en copiant ce dossier dans l'archive après14199. Les originaux restent dans `/tmp/ui-p2-observability-final` ; aucune édition Git par cet agent.
