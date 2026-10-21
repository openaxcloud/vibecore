# Parcours de lancement — recette isolée du 21 octobre 2026

## Version et périmètre

Base locale et distante vérifiée avant modification : `4af4dd1a0ba14473affb2ee7fdeabbac23b1274f` (#745).
La production `9c8f6bc6d95a97ddf54a52a932a6c07aff4f2828` est une référence fournie par la coordination, non revalidée par ce lot.
Branche : `test/parcours-lancement-20261021`. Aucune fusion ni mise en production autorisée par ce lot.

Chemins annoncés avant modifications : `app/routes/signup.tsx`, `app/routes/dashboard.tsx`, tests ciblés sous `tests/e2e/`, présent rapport et mesures sous `docs/reprise/`.
Aucune modification de `services/api`, Monaco, BaseChat, layout sauvegardé ou composants UX partagés.
L'unique checkout disponible initialement était `/workspace/vibecore` sur la branche `work` ; aucun des cinq checkouts de l'ancienne tâche n'était présent. Le commit `8edd7e4d` n'a pas été utilisé, réécrit ou publié.

PR ouvertes consultées avant modification : #718, #708, #669, #668, #666, #649, #648, #637, #632, #607, #606, #560, #559, #448, #424, #414, #366, #352, #324, #125, #79, #52. Les corrections applicatives de ce lot ne recouvrent pas leurs fichiers. La PR API #746, apparue pendant le travail, a aussi été vérifiée : SHA `e02bcab225bdfb53ce501407098543a0a56068e1`, uniquement `services/api`, sans recouvrement.

## Accès et limites réellement constatés

- Git HTTPS/GitHub authentifié avec le compte existant `openaxcloud`. Aucun credential fournisseur créé ni valeur de secret affichée ; seuls des comptes jetables locaux ont été inscrits pour la recette.
- Dépendances présentes dans `node_modules`. Node 24.19.0, Playwright 1.59.1, Chromium système 154.0.8037.57.
- Aucun conteneur initial. Pile dédiée `vibecore-journey-20261021` créée depuis `docker-compose.dev.yml`, ports PostgreSQL 55432, Redis 56379, Mailpit 8025/1025. Base et volume exclusivement locaux, migrations réellement appliquées et seed exécuté. PostgreSQL et Redis sont sains ; Mailpit reste `unhealthy` (son contrôle wget répond 403 Forbidden), non utilisé par les validations.
- Aucune variable fournisseur IA, Stripe, Resend, base ou Kubernetes initialement fournie ; seules les variables GitHub et d'exécution étaient présentes parmi les noms pertinents inspectés.
- Aucun achat, fournisseur payant, accès permanent ou modification de sécurité. Valeurs de développement déjà définies par le dépôt utilisées uniquement sur la pile locale.
- Le lanceur global `pnpm` tente une installation automatique et échoue sur `/home/agent/.local/share/pnpm`. Les binaires déjà installés dans `node_modules/.bin` permettent les commandes ciblées sans modifier le lockfile.
- Téléchargement Playwright refusé par la passerelle : `403 Domain forbidden` pour `cdn.playwright.dev`. Aucun contournement réseau ; navigateur système déjà installé utilisé explicitement pour les essais locaux. Sa version diffère de celle épinglée en CI.
- Mailpit ne valide pas l'envoi : `services/api/src/email.ts` exige Resend HTTP, sans support SMTP. Sans Resend, le développement journalise seulement. Vérification d'adresse et récupération de mot de passe non certifiées.

## Résultats réels du parcours

Les réponses API assainies figurent dans [les mesures](mesures/2026-10-21-parcours-api.json). Elles ont été obtenues par HTTP sur l'application réelle et PostgreSQL, sans interception réseau ni store simulé.

| Étape | Résultat | Limite |
|---|---|---|
| Inscription | Formulaire navigateur → dashboard et API `POST /auth/register` 201 | Compte jetable local ; livraison du mail non prouvée |
| Connexion | Formulaire navigateur → dashboard et API `POST /auth/login` 200 | Session locale réelle ; pas de validation OAuth/MFA |
| Catalogue | `GET /billing/:orgId` 200 : free, enterprise, pro, team | Aucun abonnement retourné ; liaison des droits et Stripe non validés |
| Projet | `POST /orgs/:orgId/projects` 201 | Création persistante, pas génération IA |
| Génération IA | Bloquée | Aucune clé fournisseur autorisée disponible ; aucune réponse simulée |
| Sauvegarde | Import ZIP 200, export ZIP 200, contenu exact retrouvé | Persistance API prouvée ; autosave/layout/Monaco hors lot |
| Exécution | `POST /api/runtime/workspaces` 502 `WORKSPACE_MANAGER_UNAVAILABLE` | Manager absent sur le port local 3010 ; pas de pod/runtime utilisable |
| Publication | `POST /projects/:id/deployments` 202 puis `QUEUED` | Worker/manager absents ; aucune réussite de build déduite de 202 |
| URL | `null` | Aucun site publié ni URL à certifier |
| Stripe TEST | Bloqué | Aucune clé TEST ni catalogue Stripe authentifié disponible ; aucun paiement tenté |

Le premier contrôle de contenu sur `/files` était faux : cette route renvoie des métadonnées, pas les contenus. Le journal conserve cet échec d'instrumentation. Le contrôle correct extrait ensuite `index.html` du ZIP exporté et compare exactement les 72 octets importés ; il réussit.

## Corrections

1. Inscription : une confirmation de mot de passe différente reçoit le vrai `400 AUTH_PASSWORD_MISMATCH`, associe l'erreur au champ et y place le focus après chaque soumission, y compris répétée. EN/FR ; aucun composant partagé modifié.
2. Dashboard : la checklist n'appelle plus « publié » un déploiement `QUEUED`, `BUILDING`, `FAILED` ou `CANCELED`. Seul `READY` compte. Le test soumet un vrai déploiement local avec la commande `exit 1`, prévue pour échouer si elle est exécutée, puis vérifie l'état réel et la checklist. L'état observé lors de cette recette est `QUEUED` : aucune exécution de cette commande ni échec de build n'est démontré.

Limite restante du dashboard : la sonde regarde uniquement le projet le plus récemment modifié. Une publication réussie d'un ancien projet peut être oubliée. Diagnostic signalé, non élargi à une recherche N+1 dans ce correctif.

## Recette reproductible

À exécuter dans un checkout isolé, jamais contre la production. Ne pas substituer un fournisseur simulé aux accès manquants.

1. Vérifier `git rev-parse HEAD`, `git status --short`, `git ls-remote origin refs/heads/main` et les PR ouvertes. Consigner le SHA exact des sources testées.
2. Démarrer les dépendances sous un nom de projet Docker unique :

   ```sh
   POSTGRES_PORT=55432 REDIS_PORT=56379 docker compose -p vibecore-journey-20261021 -f docker-compose.dev.yml up -d --wait postgres redis mailpit
   ```

3. Configurer uniquement la base locale `postgresql://vibecore:vibecore@127.0.0.1:55432/vibecore` et Redis `redis://127.0.0.1:56379`. Appliquer `prisma migrate deploy` depuis `packages/database`, puis `tsx packages/database/prisma/seed.ts` depuis la racine. Les mots de passe locaux sont ceux du compose du dépôt.
4. Démarrer `tsx services/api/src/server.ts` avec `API_HOST=127.0.0.1`, `API_PORT=3001`, `DATABASE_URL` et `REDIS_URL` locaux. Vérifier `/health` avant les tests.
5. Construire avec `react-router build`. Servir avec `react-router-serve build/server/index.js`, `HOST=127.0.0.1`, `PORT=5173`, `SAAS_API_URL=http://127.0.0.1:3001`. L'URL doit être explicite : le repli développement vise 8787 et produisait des 500 sur le dashboard lorsque l'API réelle tournait sur 3001.
6. Exécuter les deux specs nouvelles avec `PLAYWRIGHT_SKIP_WEB_SERVER=1`, `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173`, `SAAS_API_URL=http://127.0.0.1:3001`, sur desktop/tablet/mobile. Le test dashboard refuse les hôtes non locaux. Le test de confirmation crée maintenant un compte jetable après correction du mot de passe et vérifie sa session réelle.
7. Pour la recette complète restante : fournir par la voie déjà autorisée un fournisseur IA, Resend, le manager/worker/runtime et Stripe TEST. Consigner modèle, quota, statut réel du build, révision sauvegardée et URL HTTP inspectée. Sans ces prérequis, conserver les états bloqués.
8. Après intégration coordonnée du lot Monaco/layout et du chantier API, refaire inscription UI → connexion UI → prompt → génération → exécution → sauvegarde → rechargement → publication → visite de l'URL. Vérifier le code servi et les trois formats. Un simple 202, une capture d'écran ou des tests avec mocks ne suffisent pas.

## Validation et coordination

- Build de production local : succès, servi ensuite par `react-router-serve` avec API locale explicite.
- Playwright : **9 exécutions réussies sur 9**, soit trois scénarios (confirmation EN, confirmation FR, checklist publication) sur trois formats, avec un seul moteur Chromium ; aucun retry, 30 s par test et assertions à 5 s, Chromium système ; desktop 1440×900, tablette 1194×834, mobile 393×851. [Journal exact](mesures/2026-10-21-parcours-playwright.txt).
- Parcours navigateur indépendant : inscription → dashboard ; nouvelle connexion après suppression des seuls cookies locaux → dashboard ; accès au formulaire de création. [Résultats](mesures/2026-10-21-parcours-navigateur.json), [capture inscription](mesures/2026-10-21-parcours-inscription.png), [capture création](mesures/2026-10-21-parcours-creation.png), inspectées visuellement.
- 44 tests unitaires ciblés signup/login/onboarding passent ; ils ne remplacent pas les mesures réelles ci-dessus.
- ESLint ciblé et Prettier : succès sur les fichiers modifiés ; `git diff --check` passe.
- Typecheck scripts : succès après rétablissement des liens de trois packages déjà présents dans le workspace (`@vibecore/database`, `@vibecore/auth`, `@vibecore/security`) dans `node_modules`. Aucun changement de dépendance ou lockfile. Le premier échec TS2307 est conservé comme problème de préparation de l'environnement. Le typecheck global de tous les packages n'est pas certifié.
- Typecheck web final : succès (`tsc --project tsconfig.web.json --noEmit --pretty false`) sur les deux corrections définitives.
- Deux tentatives sur le serveur dev : chacune 4 succès/2 échecs (navigation initiale/écran de chargement/budget du test). Elles ne sont pas présentées comme vertes ; le build de production a ensuite passé les neuf cas, sans modification des assertions ni des délais.

Les [empreintes des sources et du bundle exécuté](mesures/2026-10-21-parcours-version.json) rattachent les résultats aux fichiers précis de la PR. Le SHA du commit final est celui de la tête de PR, à comparer avant intégration. Aucun merge ni déploiement dans ce lot.

Ce lot ne certifie pas la plateforme : 20 panneaux sur 31 restent sans recette d'action documentée et aucun panneau n'est entièrement certifié. Dépendance explicite sur la tâche `01a15d1c-7861-7546-af99-7f0fb04670d8` pour Monaco et la sauvegarde layout/BaseChat, et sur le chantier `services/api` pour les erreurs hors de ce périmètre.


## Compléments de revue locaux

Les compléments restent locaux tant que leur publication n'est pas confirmée. La tête distante vérifiée est `80fee0ce7e911a7e161ffed626a4b7310eb1e788` ; depuis `7b069464a94f5736a73df6673f096a03340b3f73`, elle ne modifie que ce rapport et le JSON de version pour distinguer commande prévue, état QUEUED observé et trois formats sur un moteur.

- Le helper `app/lib/dashboard-onboarding.ts` est utilisé par le dashboard. Ses six tests de logique passent, dont le cas positif READY ; ces données de test ne prouvent aucune publication réelle.
- Les scénarios EN/FR poursuivent les deux erreurs réelles par une correction, une inscription réussie, l'arrivée sur le dashboard et la vérification de la session via `/api/auth/user` dans le navigateur.
- Le nouveau bundle de production passe les neuf cas étendus en 49,8 s, sans retry ni augmentation des délais. [Journal](mesures/2026-10-21-parcours-review-playwright.txt).
- La configuration versionnée `playwright.launch-journey.config.ts` fixe Chromium système `/usr/bin/chromium`, un worker, 30 s par test, assertions 5 s, desktop 1440×900, tablette tactile 1194×834 et mobile tactile 393×851. Un seul moteur Chromium, aucun Safari vérifié.
- Commande exacte, après démarrage du serveur de production et de l'API locale : `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 SAAS_API_URL=http://127.0.0.1:3001 ./node_modules/.bin/playwright test --config=playwright.launch-journey.config.ts`. Ajouter `--project=desktop` pour le seul format desktop.
- Contre-épreuve sur le main exact `4af4dd1a0ba14473affb2ee7fdeabbac23b1274f`, serveur dev local port 5175 et même API réelle : erreur de focus EN/FR reproduite ; checklist à 2 au lieu de 1 reproduite après échauffement. Le premier essai dashboard expire pendant le chargement et reste inconclusif. Les journaux baseline conservent cet essai ; aucune assertion n'a été réduite.
- Build, typecheck web et lint ciblé des compléments réussis. Les 44 tests unitaires initiaux restent une mesure distincte des six nouveaux tests de logique.

Les empreintes du code et du bundle de cette seconde recette figurent dans [la mesure de revue](mesures/2026-10-21-parcours-review-version.json). Le [diagnostic runtime](2026-10-21-runtime-dependances.md) distingue service absent, configuration manquante et accès au banc existant ; aucun défaut serveur n'est établi par le seul 502 local. Aucun fichier serveur ou workflow modifié.
