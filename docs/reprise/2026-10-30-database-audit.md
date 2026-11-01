# Database — audit et correctifs locaux, 30 octobre 2026

Base : `bd5e0f5ea87767849d266b031b13fe4ae2e0967a` (#856). Lot limité à Database. PR draft, sans fusion ni déploiement.

| 📤 Dispatché | 💻 Codé sur main | ✅ Testé live production |
|---|---|---|
| Oui | Non, correctif sur branche | Non : recette authentifiée séparée bloquée par reconnexion |

## Ce qui est réellement câblé

`DatabaseWorkbench` / `DatabaseStudio` → route web `/api/projects/:id/ide-panel/database` → API Fastify `/projects/:id/databases`, `/schema`, `/query` → `pg` / MySQL / MongoDB / Redis. Les métadonnées d’identité, projets, permissions et secrets sont persistées via Prisma. Les requêtes PostgreSQL et MySQL autorisent les écritures ; Redis et MongoDB proposent des lectures. Aucune simulation permanente ajoutée.

Le provisionnement géré dépend du provisionneur configuré (infrastructure externe). Ce lot n’en crée pas. Le bouton Créer une base n’a donc pas été validé de bout en bout jusqu’au cloud. La fixture locale branche explicitement un vrai serveur PostgreSQL via un secret de projet synthétique ; ce raccordement ne prouve pas le provisionnement.

## Défauts corrigés

- Changer de connexion/projet conservait sélection, confirmation et données du contexte précédent. Le studio remonte désormais dans un contexte isolé.
- Le navigateur de tables perdait le schéma et ne citait pas les identifiants : noms avec espaces, majuscules, caractères spéciaux ou tables homonymes incorrects.
- L’édition construisait un `WHERE` à partir de toutes les valeurs, y compris `= NULL` : zéro ligne modifiée, ou plusieurs doublons. Elle utilise maintenant la clé primaire complète. Sans clé primaire, édition désactivée ; SQL manuel reste soumis aux permissions existantes.
- Un résultat SQL arbitraire ne peut plus hériter de la table précédente comme cible d’édition. Les raccourcis clavier et le parcours de table ne soumettent plus pendant une requête en cours.
- Une réponse PostgreSQL multi-instructions est un tableau de résultats : le dernier résultat était perdu. Il est désormais rendu avec commande et nombre de lignes affectées ; les écritures ne sont plus auditées comme lectures seules.
- Une même clé pouvait pointer vers plusieurs environnements. Les secrets suivent la priorité du runtime ; des valeurs d’environnement divergentes sans secret prioritaire sont bloquées avant connexion (409), pas choisies arbitrairement.
- Actualisation du schéma fourni prise en compte ; erreurs masquées dans les deux langues ; sélecteur et commandes peuvent revenir à la ligne sur petit écran.

## Vérification locale

Uniquement données synthétiques et serveurs loopback créés pour ce lot. Docker PostgreSQL 16 sur 55441 pour les données navigateur ; pgvector/PostgreSQL 16 sur 55442 pour le contrôle Prisma. Aucune base client, aucun compte payant, aucune requête IA payante. La fixture API refuse HTTP externe et l’envoi de mails.

- 122 tests web ciblés passent : `node_modules/.bin/vitest run app/components/database 'app/routes/api.projects.$projectId.ide-panel.database-provision-error.spec.ts'`.
- 8 tests API avec PostgreSQL réel passent (aucun sauté) : depuis `services/api`, `DATABASE_PANEL_TEST_URL=postgresql://postgres@127.0.0.1:55442/database_audit ../../node_modules/.bin/vitest run src/tests/database-panel.postgres.spec.ts`.
- Ces tests prouvent CREATE/INSERT/SELECT/UPDATE, relecture après réouverture API, répétition des écritures, rollback d’un lot en erreur, clé primaire et édition avec NULL/doublons, autorisations 401/403/404, isolation projet/organisation/clé, priorité des secrets et rejet des ambiguïtés.
- 22 régressions API existantes ciblées passent ; TypeScript API passe.
- TypeScript web, scripts Node, helpers IDE et Electron passent. Liens locaux manquants des packages workspace rétablis uniquement dans `node_modules`.
- ESLint des fichiers web modifiés : zéro erreur (un avertissement préexistant sur le callback de copie).
- Compilation web finale : `VITEST=1 VITE_CJS_IGNORE_WARNING=1 NODE_OPTIONS=--max-old-space-size=8192 node_modules/.bin/react-router build` passe (client + SSR).
- Tous les packages workspace passent le typecheck avec la commande explicite ci-dessous ; aucun contrôle désactivé.
- 6 tests de cohérence de l’index documentaire passent.
- Navigateur Chromium sur le build final : écriture confirmée, relecture PostgreSQL indépendante, autre ligne et autre schéma inchangés, relecture après rechargement ; aucun `pageerror`. Bornes sans débordement horizontal et ligne de données accessible après défilement à 1440×1000, 768×1024 et 390×844. [Résultats JSON](2026-10-30-database-preuves/browser.json), [desktop](2026-10-30-database-preuves/desktop-data.png), [tablette](2026-10-30-database-preuves/tablet-data.png), [mobile](2026-10-30-database-preuves/mobile-data.png). Le changement de format remonte le panneau, donc la recette rouvre la base. Les contrôles navigateur couvrent le thème clair ; pas de matrice complète de thèmes/langues.

La commande globale initiale de typecheck a atteint les packages puis déclenché une installation implicite avec le pnpm de l’environnement. Relance explicite sans cette installation : `pnpm --config.verify-deps-before-run=false --recursive --if-present --filter '!@vibecore/web' run typecheck`.

## Recette navigateur reproductible

Le schéma Prisma de test a été créé par `prisma db push` sur la base locale dédiée après activation de l’extension vector : il ne s’agit pas d’une preuve de migration production.

1. Démarrer les deux serveurs locaux dédiés ci-dessus, créer la base `database_audit` et appliquer le schéma Prisma uniquement sur 55442.
2. Démarrer `node_modules/.bin/tsx scripts/qa/database-panel-browser-local.ts`. Le script crée ses propres identités, projet et deux schémas synthétiques. Le jeton reste dans un fichier privé `/tmp/database-browser-fixture.json` et n’est pas affiché.
3. Construire le web puis le servir avec `SAAS_API_URL=http://127.0.0.1:8787 PORT=5174 node_modules/.bin/react-router-serve build/server/index.js`.
4. Exécuter `node scripts/qa/database-panel-browser-check.mjs`. Le script utilise Chromium local, confirme une modification via le vrai panneau, relit PostgreSQL indépendamment, vérifie l’autre ligne/l’autre schéma puis recharge la page et capture trois formats. Il refuse une cible web distante.
5. Arrêter proprement la fixture (SIGTERM) : elle nettoie uniquement ses propres objets synthétiques.

## Limites explicites

- Pas de validation production, de provisioning cloud ni de restauration PITR dans ce lot.
- Pas de serveur MySQL, MongoDB ou Redis exercé en réel ; seules les écritures PostgreSQL ont été éprouvées.
- Création de tables/ajout de lignes encore orientés SQL : pas un parcours entièrement sans code. Les connexions ambiguës sont refusées, mais l’explication de résolution dans le panneau reste générique.
- L’IDE local affiche un runtime de workspace en démarrage/reconnexion : pas de workspace distant configuré. Cela ne simule pas sa disponibilité et ne prouve pas l’aperçu de l’application générée.
- Pas de preuve exhaustive des migrations, de toutes les requêtes SQL possibles ou des performances à grande échelle.
