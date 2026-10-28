# Hub : vérifier un compte GitHub existant

Base de travail : main b9a366235ab390ae4e36be3e62a638cb519c90f3. Reprise de `docs/bugs/panel-execution-2026-10-25/INVENTORY.md`, pas nouvel audit des 32 cartes. Lot distinct de #787 (contrats Packages) et #788/#789 (Deploy/Fleet).

## Parcours implémenté

Hub → carte GitHub → Vérifier mon compte GitHub existant → BFF autorisant l'accès au projet → API authentifiée → UserConnection du demandeur → adaptateur GitHub existant → GET fournisseur `/user` → identité minimale et date après réponse validée. Aucun OAuth, jeton saisi ou nouveau droit créé. La vérification est personnelle, ponctuelle, ne lie pas le compte au projet et ne synchronise aucun dépôt.

L'API contrôle la désactivation administrative, l'état actif, le chiffrement du jeton et l'identité du compte attendu. Le fournisseur est fixe, les redirections sont refusées, le délai est borné. Le navigateur ne reçoit que login, URL GitHub reconstruite et instant. Les erreurs fournisseur ne sont pas reflétées. Une réponse 401 impose une reconnexion ; un 403 ne transforme pas automatiquement la connexion en jeton révoqué.

L'ancien connect GitHub du hub retourne 409 sans écrire de secret ni connected=true. Les anciens flags partagés du projet ne prouvent plus une connexion GitHub dans l'interface. Les anciens secrets INTEGRATION_TOKEN_GITHUB restent conservés : ce lot ne les utilise ni ne les supprime ; leur éventuelle gestion passe par le panneau Secrets existant. Révoquer un compte personnel est une autre opération, hors de ce parcours.

## Validation et portée des preuves

- Tests API : vraie application Fastify, authentification et store de test isolé, adaptateur fournisseur réel avec HTTP fournisseur simulé uniquement dans le test. Aucune donnée utilisateur ni connexion réelle.
- Tests BFF : vrai transport HTTP vers une API loopback explicitement synthétique ; projet refusé bloque l'appel de vérification ; formes malveillantes, erreurs et réponses invalides échouent.
- Tests UI : composant réel sous jsdom, transport simulé dans les tests ; chargement, reprise, résultat tardif, navigation projet et absence de fuite. Ce n'est pas une recette fournisseur ou navigateur réel.
- Résultats finaux ciblés : 32 tests de garde du hub, 18 tests du câblage UI, 25 tests du composant, 47 tests BFF et 32 tests API, soit 154 tests. Revues croisées favorables après correction des variantes de casse/espaces du legacy connect, des réponses contradictoires et de l’origine HTTPS derrière ingress.
- Typecheck web (`tsc -p tsconfig.web.json --noEmit`) et API réussis ; lint global 0 erreur / 52 avertissements préexistants. Une tentative initiale `tsc --noEmit` non limitée aux projets du dépôt a épuisé le heap ; la validation correcte utilise les configurations dédiées. Les liens locaux des dépendances API ont été réparés sans installation ni modification du lockfile, puis le typecheck API a réussi.
- Build web final (`react-router build`) réussi, client et serveur. Aucune certification production à ce stade.

## Ce qui reste exactement

Les 32 cartes restent inventoriées : CI/CD GitHub, GitLab, Jenkins, CircleCI, GitHubActions, Vercel ; communication Slack, Discord, Twilio, Resend ; projet Jira, Notion, Trello, Asana, Figma, Linear ; observabilité Datadog, Sentry, PagerDuty, NewRelic, Grafana ; données aws-s3, MongoDB, PostgreSQL, Redis, Elasticsearch ; paiement Stripe ; support Zendesk, Intercom, Hubspot, Salesforce ; automatisation Zapier.

- GitHub : seule la vérification personnelle décrite ci-dessus est raccordée. Sync, import/export, événements, exécution et publication ne sont pas ajoutés.
- Les 31 autres cartes : aucun nouveau raccordement dans ce lot. Leur configuration historique n'est pas une preuve fournisseur. Les adaptateurs GitLab, Bitbucket, Vercel, Netlify et Supabase existent ailleurs ; ils ne rendent pas ces cartes automatiquement opérationnelles.
- Sync des 32 cartes : toujours indisponible, aucun worker ou moteur ajouté.
- Webhooks du hub : configuration sans transport de livraison, signature/reprises/reçus à raccorder.
- Clés API du hub : consommateur d'authentification/périmètres/expiration/révocation à raccorder.
- Event streams : worker, transport, abonnement et mesures réelles à raccorder.
- Une nouvelle autorisation fournisseur ou un nouveau secret n'est jamais une condition silencieusement satisfaite par ces tests. Pour utiliser le parcours GitHub : compte E-Code authentifié, accès au projet, connecteur administrativement autorisé, UserConnection GitHub déjà active avec jeton déchiffrable et valide, API GitHub accessible. Si la connexion est absente/révoquée, une action explicite de l'utilisateur dans les paramètres existants reste nécessaire ; aucun grant n'a été créé ici.

## Matrice création → exécution → publication

| Preuve | Desktop | Mobile/tablette | Safari matériel |
|---|---|---|---|
| Création de projet | Non exécutée dans ce lot | Non exécutée | Non exécutée |
| Vérification GitHub | Tests API/BFF/UI isolés, aucun fournisseur réel | Composant adaptatif, recette écran non exécutée | Non exécutée |
| Sync/exécution projet | Toujours indisponible dans ce hub | Idem | Idem |
| Publication | Hors périmètre, session Deploy propriétaire | Hors périmètre | Non exécutée |

La recette production attend la reconnexion E-Code. Dispatché/codé/CI/déployé/testé live restent des états distincts ; aucun verdict global « toutes les intégrations passent ».
