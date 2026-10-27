# Capture automatique après rendu et reprise bornée

État : préparation locale sur le correctif de capture #815. Une CI ou une
recette isolée ne prouve pas le déploiement ni la réparation d'un projet client.

## Défaut reproduit

L'ancien effet de `Preview.tsx` ajoutait l'URL à un ensemble dès `ready`, avant
le rendu de l'iframe et avant le résultat de la requête. Le serveur répondait
`scheduled: true` avant de connaître l'issue de la capture. Un premier document
503 était correctement refusé par le screenshotter ; un retour ultérieur à
200 ne déclenchait aucune nouvelle demande pour cette URL.

La reproduction utilise Chromium, le vrai screenshotter HTTP, un stockage
filesystem temporaire et la vraie API avec store/session de test. Après un
503 aucun PNG n'existe ; après une nouvelle demande sur la page 200 un PNG
1280×800 est écrit et relu. Le GET de vignette refuse un visiteur anonyme et
un autre utilisateur, puis fournit au propriétaire une URL de lecture signée
par la fixture. Le téléchargement HTTP rend les mêmes octets ; une signature
altérée est refusée. Aucune clé ou donnée de production n'intervient.

## Contrat de résultat

`POST /projects/:projectId/thumbnail/refresh` conserve ses autorisations et
renvoie un résultat contrôlé, relayé par le BFF :

- `stored` : écriture terminée dans le budget de capture.
- `skipped/disabled` : service indisponible par configuration.
- `skipped/recent-success` : une écriture historique récente autorise le debounce,
  sans prétendre avoir capturé la frame courante.
- `skipped/failure-cooldown` : une nouvelle tentative doit encore attendre.
- `pending/in-flight` : opération déjà engagée.
- `pending/deadline` : budget dépassé, résultat non confirmé.
- `pending/storage-unconfirmed` : écriture engagée mais confirmation perdue.
- `failed/capture-error` : échec de capture connu.

Le budget de réponse API est de 25 secondes, BFF 28 secondes et client
30 secondes. Les opérations de stockage non annulables conservent leur verrou
jusqu'à leur règlement. Un timeout ne libère pas prématurément une écriture.
La méthode historique `capture(): Promise<boolean>` reste compatible avec les
autres déclencheurs. Une réponse ancienne `scheduled` n'est jamais convertie
en preuve de stockage.

## Déclenchement IDE

Le hook attend `ready` et un iframe rendu correspondant à l'URL courante.
Son identité associe projet et URL. Il autorise au plus trois requêtes, avec
au moins cinq secondes entre tentatives : au plus 100 secondes de demandes
et d'attentes pour une identité continuellement éligible. Un changement de
projet/URL ou démontage annule la requête et le timer ; une réponse tardive
ne modifie pas le nouvel état. Les changements de readiness ne remettent pas
le compteur à zéro. La mémoire est bornée à 32 identités.

Un succès termine les reprises. Les refus d'accès ne sont pas relancés.
Un échec connu après épuisement est signalé une seule fois ; un résultat
incertain produit une information distincte, sans faux succès ni faux échec.

## Sécurité et limites

Le screenshotter ouvre un contexte sans session utilisateur. Les tests réels
confirment qu'une preview protégée est refusée sans son cookie existant, même
si le navigateur propriétaire la lit. La configuration versionnée ne prouve
pas que ces protections soient activées dans la production observée.
Ce lot ne crée aucun accès supplémentaire, ne transmet aucun cookie utilisateur
au screenshotter et ne change ni le partage ni la politique des previews.

Une capture peut donc encore échouer pour une raison d'accès légitime, une
panne durable ou un stockage bloqué. Aucun placeholder ne tient lieu de PNG.

## Validation du lot local

43 tests web (hook, BFF, capture manuelle et garde de démarrage), 26 tests API
et trois scénarios Chromium réels réussissent. Typage officiel du monorepo,
build web/SSR et revues indépendantes favorables. La configuration de types du
screenshotter hérite désormais de Node/ES2022, adapté à ce service : l'ancienne
surcharge DOM entrait en conflit avec les flux Node utilisés par les tests
transverses. Le mode strict et les douze fichiers inclus, tests compris,
restent inchangés ; la commande officielle a été reproduite rouge puis verte.
