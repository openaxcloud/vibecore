# Recette compilée finale Hero — 13899

Build source `c2823890d2f5d8e07328a3ba1e5b3b24061b94d0`, public-admin en lecture seule, API 6899 synthétique. `source-comparison.json` confirme le fichier Marketing identique au correctif local `bef3af1d4` ; provenance PID et SHA256 du bundle dans `server-origin.json`. Le parent signale un formatage admin.billing.tsx non commité sans changement JavaScript émis : ce fichier ne concerne pas cette recette.

44 observations : 11 formats (320×900, 360×800, 390×844, 844×390, 768×1024, 820×1180, 1024×768, 1280×800, 1440×900, 1920×1080, 2560×1440) × FR/EN × clair/sombre. Huit groupes clavier à 320/1024 : focus CTA, Tab, Shift+Tab retour, Escape sans changement de route. Huit captures ciblées, dont 320 FR et 1024 FR inspectées. Pas 44 tests indépendants ni nouvelle route couverte.

`receipt.json` completed : 44 observations, 8 groupes, 0 erreur JS, 0 échec. Tous les CTA documentation mesurent 44 px ; Range du texte dans le bouton, textes conservés entre formats, liens `/docs` et `/contact-sales` inchangés. Trois cartes présentes, grille dans le viewport, titres sans débordement et Range dans les cartes. Aucune injection CSS dans cette recette. Les captures confirment le bouton FR sur deux lignes à 320 et les cartes lisibles à 1024. Les deux défauts ciblés sont validés localement sur build ; main/live restent faux.

La première tentative avant ouverture du port a échoué connection-refused avec zéro observation : `startup-race-receipt.json` et `startup-race.log` conservés comme erreur de lancement du harness, pas défaut produit. La tentative effective démarre après annonce du serveur et se termine exit 0. L’échec produit 13799 reste archivé dans le dossier précédent.

Aucune mutation, téléchargement, donnée réelle ou backend externe. 88 GET GoogleFonts bloqués. Pas de test d’activation des destinations, zoom, Safari/Firefox, clavier OS/virtuel, lecteur d’écran, safe areas ni contraste WCAG. Cette recette ciblée ne rejoue pas les 1 276 observations des autres pages ni ne valide globalement les 30 IDs.

Navigateurs fermés en fin de harness. `cleanup.json` revalide PID/startTicks/cmdline avant SIGTERM et, si nécessaire, SIGKILL après nouvelle validation ; les états finaux Z sans RSS/cmdline sont distincts des ports refusés. Seuls app 207119 et API 207118 concernés. Logs archivés avec fins de lignes normalisées et espaces finaux retirés. Aucun nouveau build, source, index ou push.
