# Recette du build commun — 12199

Build parent réussi, arbre produit `fbb678704aefe10abe230620e6de47c4aec5bec9`. Aucun rebuild local. Chromium local, API6199 synthétique ; aucun fournisseur externe ni backend réel.

40 observations : reset-password et verify-email × FR/EN × clair/sombre ×320×900,390×900,844×390,820×1000,1440×900. Toutes les cibles mesurées sont au moins44px ; révélation conserve le mot de passe synthétique et fonctionne via Tab/Space. Le padding52px garde le bord de zone texte avant le bouton. Sélection en fin de champ relevée dans le reçu ; il ne s'agit pas d'une mesure du pixel du caret interne au navigateur.

Quatre parcours supplémentaires (FR/EN × thèmes) : saisie puis resize1440→844→320 conservée ; renvoi503 synthétique, état désactivé44px, texte long à320 contenu, avancement virtuel61secondes puis réactivation. QuatrePOST navigateur vers la fixture locale, aucune écriture non autorisée et aucune erreur JS. Les36POST métier antérieurs ne sont pas rejoués ici.

20 captures rapprochées. Inspection directe de reset FRclair320, reset ENsombre1440 et cooldown FRclair320 : contrôle/texte visibles ; le compteur français se replie sur deux lignes. Pas de certification contraste ni de test clavier virtuel matériel. Polices Google externes bloquées, zoom200% et WebKit non exercés dans cette recette.

Seul reset-password utilise actuellement AuthField type=password (deux champs) ; login/signup ont des champs mot de passe propres. Aucun changement global RevealButton/CSS. Les mesures du reçu ciblent le premier champ password, pas une prétendue mesure individuelle de tous les champs.

Navigateurs fermés. Serveurs11999/12199/API6199 arrêtés après contrôle PID/startTicks ; connexion refusée vérifiée, reçu cleanup.json. Aucun autre serveur touché.
