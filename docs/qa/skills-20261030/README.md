# Skills — audit réel isolé du 30 octobre 2026

Base : `bd5e0f5ea87767849d266b031b13fe4ae2e0967a` (#856).
📤 Dispatché ☑ · 💻 Codé sur main ☐ (branche / draft seulement) · ✅ Testé live production ☐.

## Défauts corrigés

1. Le loader transformait toute erreur du registre, du catalogue, des installations et de l'audit en listes vides. Il retourne maintenant l'enveloppe d'erreur existante, avec récupération/rechargement du panneau. L'absence de workspace confirmée par le catalogue reste un état vide légitime.
2. La désactivation projet était filtrée avant résolution des doublons : la copie workspace activée pouvait réintroduire le même dépôt dans le contexte modèle. La priorité projet s'applique maintenant avant filtrage.
3. Quand GitHub échouait, un dépôt du catalogue était installé avec sa description comme instructions, renvoyant 201. Le manifeste absent/inaccessible produit maintenant 404/502 sans installation.
4. Le PATCH d'activation pouvait contourner l'approbation explicite d'une installation en quarantaine. Il retourne maintenant 409 `SKILL_APPROVAL_REQUIRED`; `/approve` reste le parcours explicite et journalisé. Après désactivation d'une installation quarantinée précédemment approuvée, une nouvelle approbation est nécessaire. Le bouton Approuver existe déjà dans le panneau.

## Parcours et preuves

| Étape | Implémentation / résultat |
|---|---|
| Catalogue natif et communautaire | API réelle, libellés français, recherche locale Community, consultation des métadonnées ; 12 dépôts présentés dans la recette UI |
| Activation / désactivation native | Bouton réel → action BFF → API → Prisma ; choix conservé après rechargement aux 3 formats |
| Installation de dépôt | Fetch SKILL.md/AGENTS.md/README.md racine, audit, persistance ; tests de route avec fetch fixture uniquement, **aucune installation tierce réelle** |
| Installations projet / workspace | Fixture textuelle locale, HTTP réel + Prisma ; désactivation, révocation, refus de réactivation, désinstallation, audit journalisé |
| Persistance | Fermeture/réouverture API et client Prisma ; nouvelle lecture conserve le choix. Base PGlite PostgreSQL WASM sur disque temporaire, pas un store mémoire simulé |
| Portée | Native : projet. Dépôt installé : projet ou premier workspace du projet. Pas de portée organisation offerte. Autre projet non affecté |
| Permissions / entrées invalides | Session invalide 401, utilisateur sans accès refusé, booléen invalide et scope organization rejetés 400, révocation non réactivable |
| Préparation modèle | Vrai `retrieveSkillsForAgentContext` → vrai `streamText` → SDK `doStream`, build et discuss. Registre synthétique, fournisseur `MockLanguageModelV1`, fetch interdit. Inclusion puis disparition des consignes vérifiées |
| Responsive | Chromium 1280×1000, 820×1000, 390×1000 ; panneau sans débordement (588/771/358 px), toggle persistant, recherche sans résultat. Captures et `browser.json` ci-joints |

Les modèles et runtimes distants ne sont pas exercés. Le navigateur bloque les hôtes externes et les chemins chat/runtime. Le serveur SSR a tenté une lecture de catalogue OpenRouter qui a expiré ; aucune génération ni invocation modèle payante n'a été effectuée. Les tests de préparation utilisent explicitement un fournisseur factice : **ce n'est pas une réponse fournisseur réelle**.

## Validation

- API : 36 tests passent, dont 3 tests HTTP + Prisma sur base isolée.
- Web : 33 tests passent, dont 2 préparations SDK (avant/après désactivation, build/discuss).
- Typecheck API : passe. Typecheck application web : passe.
- Typecheck global des scripts : **bloqué** par 4 TS2307 préexistants dans `scripts/qa/database-restore-api-fixture.ts` et `scripts/qa/database-restore-physical.ts` (imports @vibecore/database/auth/security). Aucun correctif hors scope.
- Builds web client/SSR et API : passent.
- ESLint fichiers web touchés : zéro erreur, un avertissement préexistant `no-empty-function` ligne 361 du BFF.
- `git diff --check` : passe.
- Premiers essais navigateur invalidés pendant le remplacement des assets du build ; seules les recettes après redémarrage du serveur compilé figurent dans `browser.json`.

## Reproduction locale

Depuis la racine, Node 24 et dépendances du lock installées :

```sh
node scripts/skills-proof-database.mjs
```

Le script n'utilise aucun DATABASE_URL externe ; il ouvre uniquement 127.0.0.1:55439, données dans un nouveau répertoire temporaire. Il applique les migrations réelles sauf les trois migrations AgentMemory/pgvector non utilisées par Skills (0010, 0013, 0035). Ce n'est pas une preuve pgvector, migrations production ou concurrence PostgreSQL multi-connexion. PGlite utilise un backend unique.

Dans un autre terminal :

```sh
cd services/api
SKILLS_DATABASE_PROOF=1 NODE_ENV=test DATABASE_URL=postgresql://proof:proof@127.0.0.1:55439/skills_proof DATABASE_POOL_MAX=1 ../../node_modules/.bin/vitest run --config vitest.config.ts src/tests/skills-persistence.integration.spec.ts src/tests/skills-routes.spec.ts src/tests/skills-install-routes.spec.ts src/tests/skills-audit-routes.spec.ts src/skill-disclosure.spec.ts
```

Tests web depuis la racine :

```sh
node_modules/.bin/vitest run 'app/routes/api.projects.$projectId.ide-panel.skills.action.spec.ts' app/lib/.server/llm/project-skills.spec.ts app/lib/.server/llm/skill-disclosure.spec.ts app/lib/.server/llm/stream-text.skills.spec.ts
```

Recette navigateur, avec les processus précédents de tests arrêtés (PGlite single backend), trois terminaux depuis la racine :

```sh
NODE_ENV=test DATABASE_URL=postgresql://proof:proof@127.0.0.1:55439/skills_proof DATABASE_POOL_MAX=1 node_modules/.bin/tsx services/api/scripts/skills-proof-server.ts
NODE_ENV=production SAAS_API_URL=http://127.0.0.1:18787 PORT=21999 HOST=127.0.0.1 node_modules/.bin/react-router-serve build/server/index.js
node docs/qa/skills-20261030/browser.cjs
```

Le fixture server écrit uniquement un jeton éphémère synthétique dans `/tmp/skills-browser-fixture.json`; ne jamais publier ce fichier. Aucun secret réel, aucun utilisateur client, aucune mutation production.

## Limites et intégration

- Pas de validation authentifiée production (reconnexion coordonnée ailleurs), Safari, lecteur écran ou zoom 200 %.
- Recette visuelle couvre les natifs et le catalogue, pas toutes les variantes d'installations/quarantaine ni tous les thèmes.
- Les skills natifs sont des consignes descriptives, pas de nouveaux outils exécutables. Pas de formulaire de configuration supplémentaire hors activation/installation/approbation.
- Les instructions installées sont sélectionnées par correspondance lexicale ; la pertinence français/anglais n'est pas garantie.
- Les ressources L3 référencées ne sont pas récupérées réellement dans le chemin courant ; aucune exécution de scripts de skill prouvée.
- Les anciennes installations qui contiennent déjà un résumé à la place des instructions ne sont pas modifiées : aucun accès ni migration des données de production autorisé ici.
- La PR touche le bloc Skills du BFF `api.projects.$projectId.ide-panel.$panel.ts` et deux blocs Skills de `services/api/src/app.ts` ; le coordinateur doit intégrer ces petits hunks si d'autres panneaux évoluent. Aucun changement à `BaseChat.tsx`, `api.chat.ts` ou `stream-text.ts` pour éviter les conflits avec l'équipe streaming.

Ces limites empêchent de qualifier l'ensemble Skills de « terminé en production ».
