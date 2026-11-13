# Extension navigateur privée — préparée, non exécutée

Cette extension est développée sur `ci/private-runtime-browser-20261113`, à partir
de PR925 (`302753494`). Elle ne modifie pas cette branche distante et ne remplace
pas les preuves API/agent des runs 43440753492 et 43442951559.

Le workflow distinct `private-runtime-browser.yml` accepte `workflow_dispatch` ou
le seul push `validation/private-runtime-browser-20261113`, branche de validation
sans PR. **Aucun lancement n'est autorisé avant revue des triggers et accord de
coordination.** La branche temporaire n'est pas créée/poussée par cette préparation.
La PR de préparation porte `[skip ci]` pour éviter les workflows E2E existants à clés.

## Parcours et composants

1. Compiler la vraie application React Router avant de créer kind, pour limiter
   le pic mémoire. Imposer `RUNTIME_MODE=remote-kubernetes` et une cible API locale
   explicite, afin d'éviter une preuve accidentelle WebContainer.
2. Construire le banc existant et exécuter toutes ses assertions API/agent,
   notamment l'image Node24/musl et les archives réelles.
3. Démarrer la vraie application web sur `127.0.0.1:5173`. L'API et le manager
   restent dans kind ; les forwards existants restent limités au loopback.
   Le profil navigateur ajoute uniquement à l'API éphémère une origine CORS
   `http://127.0.0.1:5173` et une URL privée de preview sur le port API local.
4. Dans Chromium : s'inscrire par `/register`, puis utiliser une session navigateur
   neuve pour se connecter par `/login`. Aucun token ou cookie d'authentification
   n'est injecté par le test.
5. Créer le projet par la vraie page `/import-zip`. Le ZIP contient un serveur
   Node sans dépendances, un package.json et du HTML contrôlé ; ce n'est pas une
   génération IA ni une réponse de fournisseur simulée.
6. Ouvrir index.html dans le véritable arbre de fichiers/Monaco, modifier le
   contenu par le clavier, sauvegarder, attendre une réponse de persistance,
   recharger l'UI et relire le marqueur modifié.
7. Ouvrir Webview et exiger le marqueur modifié dans l'iframe réelle. Exiger aussi
   des réponses réussies de la vraie API runtime, sans `route.fulfill`, bridge ou
   remplacement de serveur. Le nettoyage existant supprime le cluster généré.

## Protections et résultats

Permissions `contents: read`, aucun secret externe/OIDC/fournisseur, aucun achat
cloud, ingress, DNS public ou publication. La garde navigateur refuse les variables
externes de credentials usuelles. Les requêtes navigateur hors des deux origines
locales sont bloquées, ainsi que les endpoints de génération connus ; toute tentative
vers ceux-ci fait échouer le test. Cela ne simule aucune réponse applicative.

Le reporter conserve seulement titre/statut, phases terminées et capture finale de
la preview contrôlée. Pas de trace, vidéo, headers, cookies, mots de passe ou logs
bruts web. Un résultat vide, ignoré ou sans l'unique test passé fait échouer le runner.

Les validations locales (tests unitaires/HTTP de fixture, typecheck, lint,
découverte Playwright, schémas et build web) ne prouvent pas le parcours navigateur.
Celui-ci doit être exécuté dans le banc après revue, car kind est toujours bloqué
localement par `ip6tables filter`. Ni l'IA, ni la livraison d'email, ni la sécurité
production ne sont couverts. Aucun changement de garde ou configuration production.

## Vérifications ciblées

```sh
node_modules/.bin/vitest run scripts/private-runtime-recipe/checks.test.ts scripts/private-runtime-recipe/browser/guards.test.ts
node_modules/.bin/tsc -p scripts/private-runtime-recipe/tsconfig.json
node_modules/.bin/eslint scripts/private-runtime-recipe/browser/*.ts scripts/private-runtime-recipe/{run,manifests}.ts
node_modules/.bin/playwright test --config scripts/private-runtime-recipe/browser/playwright.config.ts --list --reporter=list
```

La découverte doit annoncer exactement un scénario. Les futures corrections du
parcours doivent conserver ces assertions ; un défaut produit rencontré sera
rapporté distinctement, sans le masquer par une fixture UI ou une exclusion.

État de préparation du 13 novembre : 13 tests Vitest passent (dont HTTP réel du
serveur importé), typecheck/lint/actionlint passent, 16 ressources Kubernetes sont
validées strictement, Playwright découvre un unique scénario et le build web
client+SSR avec `RUNTIME_MODE=remote-kubernetes` et API locale passe. Le parcours
Chromium contre kind n'a pas été exécuté ; aucun run de ce workflow n'a été lancé.
