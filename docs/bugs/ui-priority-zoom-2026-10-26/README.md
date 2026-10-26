# Zoom navigateur Chromium200% — échantillon Auth, équipe et Galerie

Complément documentaire, sans code, index ou overlay partagé modifié. Source priority figée944592e18 ; build commun conservé annoncé fbb678704, empreintes réelles dans [source-build.json](source-build.json). Aucun rebuild. Serveur13599/API6799 dédiés, copie de fixture GET synthétique existante ; API réelle, paiement, fournisseur, export et mutations interdits. Profil Chromium éphémère, aucun nouvel accès.

## Preuve du mécanisme de zoom

Le harness ouvre `chrome://settings/appearance` et utilise les API internes du navigateur `chrome.settingsPrivate.setDefaultZoom(1)` puis `setDefaultZoom(2)`. `getDefaultZoom` retourne effectivement1 puis2. Ce réglage est celui du navigateur ; aucun CSS zoom, deviceScaleFactor, Emulation.setPageScaleFactor ou pinch n’est appelé.

[receipt.json](receipt.json) contient6 transitions100→200% :3routes ×FRclair/ENsombre. À fenêtre externe1440×900 inchangée, la largeur CSS passe1440→720, DPR1→2, visualViewport.scale reste1 ; zoom calculé HTML/BODY reste1. Ces preuves conjointes établissent le vrai zoom navigateur dans cet environnement Chromium headless ; DPR2 seul n’aurait pas suffi.

Deux tailles de fenêtre sont ensuite demandées avec Browser.setWindowBounds :640 et1440. Elles correspondent réellement à outerWidth640/1440 et innerWidth320/720 à200%. Aucun cas ambigu390→outerWidth500 n’est utilisé dans ce complément. Captures via Page.captureScreenshot avec fromSurface:true/captureBeyondViewport:false, en pixels physiques ; les premières captures Playwright inexploitables d’un ancien lot ne sont pas réutilisées.

## Échantillon et résultats exacts

12 observations = Reset (`/reset-password?token=SYNTHETIC-NONFUNCTIONAL`), TeamSettings (`/teams/synthetic-team/settings`), Gallery (`/gallery`) ×2modes FRclair/ENsombre ×2fenêtres640/1440. C’est un complément de3routes déjà partiellement exercées, **aucune nouvelle route P1** : dénominateurs globaux94partiels/103nonexercés/5réservés/155horsUI et43transitions inchangés.

- Contenu : largeur du document et bornes horizontales des h1/h2/input/button visibles mesurées dans chaque observation ; aucun dépassement détecté. Les tableaux intentionnellement défilants et tous les descendants ne sont pas prétendus validés par cette sélection.
- Auth : texte synthétique saisi à100%, passage vivant200%, puis resize640→1440 ; valeur et focus du premier champ password conservés dans les2modes. Aucun reset soumis, aucune requête de mutation. Les boutons présents sont mesurés dans targets mais aucune activation Reveal ni minimum44 universel n’est affirmé par cette recette.
- Équipe : vrai contenu enfant Team settings présent et lisible sur capture ENsombre320CSS ; pas d’export, filtre ou modification de droits. Aucun parcours complet des actions de table.
- Galerie : observation de page et complément ciblé FRclair320CSS dans [gallery-target.json](gallery-target.json). Titre long et tag ont clientWidth=scrollWidth246px, bornes37→283 dans viewport320 ; contenu conservé. La [capture ciblée](gallery-target-fr-light-640-200.png) montre le titre replié après scroll ; tags plus bas mesurés DOM mais non tous visibles simultanément dans cette capture. Ce complément n’ajoute pas une13e cellule à la matrice ni un nouvel ID.

Zéro pageerror, zéro mutation tentée, pas de dépassement document/cibles sélectionnées. Les tiers sont bloqués et consignés dans receipt.blocked ; les polices Google indisponibles limitent la comparaison typographique avec production. `fetch-guard.cjs` borne les fetch serveur à API6799 en GET. Fixture refuse aussi nonGET et export. Aucun compte, session, email, secret ou accès réel.

## Captures et limites

12captures de viewport plus1capture ciblée Galerie sont fournies. Inspection directe ciblée de Reset FRclair640, TeamSettings ENsombre640, Gallery FRclair640 et carte Galerie FRclair640. Les autres captures ne sont pas présentées comme une revue visuelle exhaustive. L’image Reset est centrée sur le champ focalisé ; le sélecteur de langue flottant recouvre une partie de l’introduction défilée au-dessus. Aucune promesse de visibilité simultanée de tout le contenu ou d’absence universelle d’occlusion n’est faite. Les captures Galerie de haut de page n’affichent pas toute la longue page à la fois : défilement normal distinct du clipping horizontal.

Seulement FRclair etENsombre, pas les4combinaisons ; deux largeurs CSS320/720, pas toutes les tailles. Pas de contraste WCAG calculé, lecteur d’écran, clavier virtuelOS, safearea physique, Safari/WebKit ou Firefox. Le canari WebKit CI#800 relève d’un autre périmètre et ne valide aucune de ces pages. Aucun backend réel ou environnement production. Les anciens README sans zoom décrivent leurs phases historiques et restent inchangés.

## Provenance et arrêt

Scripts exacts dans audit.cjs, gallery-target.cjs, fixture.cjs, fetch-guard.cjs et launch.py. Profils/caches Chromium volontairement exclus de l’archive. Deux profils de matrice et un profil de capture ciblée fermés via context.close dans finally ; [browser-origins.json](browser-origins.json) conserve les PID enfants de la matrice.

Serveur13599 PID188380 et fixture6799 PID188379 identifiés par fichiers d’origine et startTicks avant SIGTERM ; [cleanup.json](cleanup.json) confirme ports refusés111. Aucun autre processus arrêté. Logs copiés avec espaces/fins de lignes terminaux normalisés ; originaux /tmp/ui-priority-nativezoom conservés. Aucun test produit/build supplémentaire ni publication.
