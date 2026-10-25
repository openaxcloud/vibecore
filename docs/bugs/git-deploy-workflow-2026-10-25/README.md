# Git / Publish / Domains — recette du 25 octobre 2026

Ces preuves portent sur une pile locale isolée, dans l'environnement cloud de travail : PostgreSQL et Git réels, API source, web compilé et Chromium système. Comptes et projets synthétiques uniquement. Aucune publication cliente, mutation DNS, connexion à un fournisseur Git externe, infrastructure payante ou production.

## Résultats

Le [reçu expurgé](receipt.json) distingue les contrôles réels, l'injection de panne navigateur et les limites.

- API réelle : import ZIP, statut Git, commit confirmé dans le graphe, création de branche et diff d'un fichier réellement modifié.
- GitCliProvider réel avec dépôt bare local : push vérifié par SHA, pull vérifié par contenu, conflit de deux clones identifié par `409 GIT_MERGE_CONFLICT` avec son chemin.
- Suite existante GitCliProvider : 6 tests passent. Git est réel ; certains tests de routes utilisent `TestApiStore`, pas PostgreSQL.
- Première recette navigateur compilée : indexation et commit UI réels réussis, puis ouverture Publish → Domains à 1440 et 1024 px. Le passage à 390 px perd le sous-onglet et le brouillon : contre-épreuve rouge conservée. La recette finale du correctif passe **1/1 en 22,9 s** (23,9 s total), sans retry ni omission : sous-onglet et brouillon conservés sur les trois tailles et après Logs → Domains, erreur 503 injectée puis récupération réelle, navigation Git puis retour navigateur vers Publish.

Captures : [commit réel desktop](git-commit-desktop.png), [Domains desktop](domains-desktop.png), [échec avant correctif au passage mobile](before-mobile-resize-reset.png). Après correction : [mobile avec brouillon conservé](after-mobile-resize-retained.png), [tablette](after-tablet-resize-retained.png), [erreur actionnable](domains-actionable-error.png). Les noms affichés sont ceux des fixtures synthétiques.

## Rejouer

Depuis la racine du dépôt installé :

```bash
node_modules/.bin/tsx docs/bugs/git-deploy-workflow-2026-10-25/git-remote-proof.ts
QA_API_BASE_URL=http://127.0.0.1:3016 node docs/bugs/git-deploy-workflow-2026-10-25/api-proof.mjs
```

Le premier script crée uniquement des dépôts temporaires locaux et les supprime dans `finally`. Le second exige une URL de boucle locale ; il crée un compte/projet synthétique dans **une API de test dédiée**. Ne pas pointer une passerelle locale vers une API réelle. Les reçus vont dans `/tmp/git-deploy-{remote,api}-proof.json`, ou dans `QA_RECEIPT_PATH`.

La pile de cette recette utilise deux conteneurs éphémères, sans volume persistant, exposés uniquement sur `127.0.0.1` : `vibecore-gitdeploy-qa-pg` (55446, pgvector/pgvector:pg16) et `vibecore-gitdeploy-qa-redis` (56386, redis:7-alpine). L'API utilise un environnement hérité vide, une base dédiée et `PROJECT_STORAGE_DIR=/tmp/gitdeploy-qa/projects`. Le web compilé utilise `SAAS_API_URL=http://127.0.0.1:3016`, écoute sur 5197 et ne possède aucun identifiant fournisseur.

La migration Prisma a échoué avant exécution, faute de résolution DNS de `binaries.prisma.sh`. Les 102 fichiers SQL versionnés ont été appliqués dans l'ordre à cette base vide avec `psql -v ON_ERROR_STOP=1`, puis le seed du dépôt a réussi. Cela ne certifie pas le lanceur de migrations Prisma.

Le test navigateur versionné est `tests/e2e/git-deploy-workflow.spec.ts`. Lui fournir `PLAYWRIGHT_BASE_URL` et `SAAS_API_URL` de la pile dédiée. Cette recette utilise Chromium système `/usr/bin/chromium`, sans retry. Le cas 503 Domains est **une panne réseau injectée par Playwright**, suivie d'un vrai Retry vers l'API locale ; ce n'est pas une panne fournisseur observée.

Après recette, arrêter seulement les deux processus API/web démarrés pour celle-ci, puis :

```bash
docker stop vibecore-gitdeploy-qa-pg vibecore-gitdeploy-qa-redis
```

`--rm` supprime les conteneurs et leur stockage éphémère. Les fichiers et preuves dans `/tmp/gitdeploy-qa` restent disponibles pour inspection ; ne pas publier les traces navigateur ou journaux API bruts, qui peuvent contenir des sessions de test.

## Limites conservées

Les tentatives sur serveur Vite dev ont rencontré `useContext` null et un graphe de dépendances React incohérent avant ouverture des panneaux, y compris après régénération du cache. Les recettes compilées sont distinctes. Une tentative pendant reconstruction a échoué avant démarrage serveur, car `build/server/index.js` était momentanément absent ; elle ne mesure pas le produit.

Aucune validation production, Safari/WebKit, authentification Git externe, publication réelle, DNS, ni éditeur de résolution des conflits navigateur n'est revendiquée. Le push/pull testé utilise exclusivement un dépôt bare local.

La première tentative finale a été interrompue sur un sélecteur de test incorrect (`Retry` au lieu du bouton réel `Refresh domains`). Le sélecteur a été corrigé à partir du catalogue et de la capture, sans changement produit, assertion ni délai. Le passage final ci-dessus utilise cette correction ; les tentatives précédentes restent décrites dans le reçu.
