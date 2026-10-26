# Authentification — audit local du 26 octobre 2026

Base avant correctif : `05c4e412e0ad21b77a36a26dad5091f7d7bf9bde`. Chromium local, app11999 et API6199 synthétique uniquement. Les deux corrections locales ne sont pas encore vérifiées sur un build compilé corrigé ; cette recette est réservée au build consolidé du parent.

## Couverture réellement exécutée

- Quatre pages réellement visitées : `/forgot-password`, `/register`, `/reset-password`, `/verify-email`. 80 observations = quatre pages × FR/EN × clair/sombre × 320×900,390×900,844×390,820×1000,1440×900. Aucun débordement détecté dans les éléments mesurés, ni chevauchement Retour/langue.
- 16 groupes : validation native vide, saisie longue synthétique, redimensionnement1440→844→320, Tab/Escape, lienRetour puis Back. Aucun POST navigateur dans cette phase, aucune erreur JS. 192 requêtes Google Fonts bloquées : polices de repli locales, limite explicite.
- Trois routes de protocole supplémentaires : `/auth/oauth/:provider`, `/auth/oauth/:provider/callback`, `/logout`. 27 cas synthétiques dans `protocols.json`, sans fournisseur suivi, compte créé, email émis ou session réelle. Des POST vers la fixture localhost ont bien été exécutés ; ne pas les qualifier de zéro mutation tentée. La fixture ne persiste aucune donnée et interdit les créations de compte réussies et l'émission de session.
- Contrôle distinct de canonicalisation `/register` :301 avec Host explicite via node:http, destination externe non suivie (`canonical-host.json`). Le premier essai fetch ne transmettait pas ce Host comme attendu ; son échec est un diagnostic de harness conservé, pas un défaut produit. Le premier harness supposait aussi à tort toute réponse OAuth redirigée : le503 est conservé comme branche actuelle, pas masqué.

## Défauts et correction locale

1. Reset : contrôle révéler28px à320 et24px à1440. Réutilisation locale de `vc-auth-input-action` ; aucun changement au composant RevealButton global ni au CSS partagé. Le padding droit passe à52px pour éviter le recouvrement du texte par le contrôle44px : contrepreuve DOM garde2,75px/3,5px d'espace respectivement.
2. Vérification email : renvoi19,875px à320 et17,031px à1440. Classes locales inline-flex/min-h44/wrap, sans changer le délai, l'action ni les états désactivés.

Les quatre captures `counterproof-*` sont des modifications DOM synthétiques, pas une preuve du build corrigé. La matrice80 et les captures restantes concernent le build avant correction.

## Validation et limites

18 tests existants passent sur quatre fichiers : auth-touch-targets(5), AuthI18n(2), auth-password-i18n et verify-email.mfa-redirect (comptes individuels dans le log). Lint des deux fichiers, Prettier et diff-check passent. Revue du patch par le parent favorable avant application. Aucun nouveau build après correction, push ou déploiement dans ce lot.

Non exercés ici : actions métier UI après soumission, authentification réelle, OAuth fournisseur réel, réussite création compte/session, vraie délivrance email, token réel, production, WebKit, zoom200%, clavier virtuel matériel. `/signup` n'hérite pas de la couverture `/register`. Sept routes/groupes partiellement exercés, pas sept écrans ni certification globale.
