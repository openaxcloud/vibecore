# Reprise du chargement avant connexion — 22 octobre 2026

Base inspectée : `18cf74fd7abcd59620f0994b44ac1411e97fcf93`. Le manifeste joint épingle les six sources produit du bundle local testé. Aucun compte, fournisseur IA, paiement ou projet utilisateur n’a été sollicité par cette recette.

## Comportement

Un catalogue public en attente empêchait indéfiniment l’hydratation. Une erreur HTTP déclenchait au contraire une hydratation sans les traductions SSR. Le correctif borne la requête entière à dix secondes, corps inclus ; il abandonne la requête et propose une reprise explicite en cas d’erreur HTTP, JSON ou de format. Le message traduit est rendu par le serveur et fonctionne sans catalogue. Le bouton reprend le chargement ; React hydrate seulement après réception des traductions, avec les attributs SSR restaurés.

Le délai appartient au produit et est vérifié par la recette ; aucun délai de test artificiel, clic forcé ou exception d’assertion n’est ajouté. Le panneau de reprise passe au-dessus du logo de démarrage afin que son bouton reçoive effectivement les clics.

## Preuves locales et limites

- 12 tests de logique : attente des en-têtes/corps, abandon, validation HTTP/JSON/format, reprise et une seule hydratation. Doubles contrôlés, pas validation production.
- 12 cas navigateur sur le vrai bundle de production local : normal, lent, pendant,503,JSON invalide,forme invalide × anglais/français. Une seule version Chromium système, viewport1280×900, zéro retry de test. Chaque reprise effectue une nouvelle requête, affiche les champs email/mot de passe, préserve langue et `returnTo`, sans erreur React ni libellé « Unavailable ».
- Reprise503 en français vérifiée par clic réel sur desktop1280×900, tablette768×1024 et mobile390×844 ; pas de débordement horizontal, captures inspectées. Trois formats d’un même moteur Chromium, pas Safari ni appareils physiques.
- Contre-épreuve : le cas503 anglais reste rouge sur le bundle historique local883af053 (absence de l’interface de reprise). Les sources du chemin démarrage/login/i18n étaient identiques entre cette base et18cf74fd ; cette comparaison ne prétend pas tester tout18cf avec l’ancien bundle.
- Typecheck officiel complet vert (web, scripts, helpers navigateur IDE, Electron, packages et services). Lint app complet : zéro erreur,52 warnings dans des fichiers inchangés ; lint des fichiers du lot : zéro erreur ni warning. Index bugs :6 tests verts.
- Build final réussi avec heapNode8GiB sur une limite mémoire16GiB. Le premier lancement direct sans cette configuration a épuisé le heap : son rouge est conservé dans `initial-oom.txt`. La configuration8GiB correspond déjà au script build du dépôt ; aucun changement de ressource ou de code de compilation.
- Le premier candidat révélait un bouton masqué par le logo (`z-index` du boot supérieur) : recette rouge conservée hors dépôt dans `/workspace/vibecore-747-handoff/login-catalogue-fix/recovery-layer-red`. Le candidat final corrige cette couche, sans modifier les assertions.

L’incident production (logo et erreurs React418/423) a été observé dans un autre navigateur ; le catalogue défaillant n’a pas été identifié sur cette session. La reproduction contrôlée ne prouve donc pas la cause de cet incident. Ce lot ne valide ni authentification, génération, workspace ou publication de projet, ni les erreurs de patches du projet utilisateur.

## Reproduction

Dépendances déjà installées, Node24.19.0 (contrat dépôt>=22.12), pnpm9.14.4, Chromium154.0.8037.57 `/usr/bin/chromium`. Les liens de dépendances du worktree pointent sur les paquets installés existants ; aucune installation propre depuis le lockfile n’est revendiquée. Les packages internes pointent sur ce worktree.

```sh
NODE_OPTIONS=--max-old-space-size=8192 node node_modules/@react-router/dev/bin.js build
HOST=127.0.0.1 PORT=5196 SAAS_API_URL=http://127.0.0.1:3017 NODE_ENV=production node node_modules/@react-router/serve/bin.js ./build/server/index.js
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5196 node node_modules/@playwright/test/cli.js test --config playwright.startup-recovery.config.ts
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5196 node docs/reprise/login-catalogue-recovery-2026-10-22/capture-responsive.cjs
node node_modules/vitest/vitest.mjs run app/lib/i18n/catalogues-client.spec.ts app/lib/i18n/startup-catalogues.spec.ts scripts/index-a-jour.spec.mjs
NODE_OPTIONS=--max-old-space-size=8192 node scripts/typecheck.mjs
node node_modules/eslint/bin/eslint.js app
```

Le serveur API local3017 était absent : les formulaires publics utilisent le traitement existant d’indisponibilité du catalogue de fournisseurs d’authentification. Aucun fournisseur n’est simulé comme utilisable. Le test intercepte uniquement le fichier de traductions public pour injecter la panne ; les scénarios normal et reprise servent son contenu réel.

L’index bugs est régénéré avec `node scripts/migrer-inventaire-bugs.mjs --index`. Il normalise aussi deux entrées anciennes déjà divergentes sur la base ; leurs documents sources ne sont pas modifiés.

Les copies de journaux jointes normalisent uniquement les espaces de fin de ligne ; les journaux bruts restent dans `/workspace/vibecore-747-handoff/login-catalogue-fix/`.
