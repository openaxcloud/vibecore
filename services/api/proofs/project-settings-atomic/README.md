# Paramètres de projet atomiques — recette du 21 octobre 2026

Lot dépendant de #746, base exacte `e02bcab225bdfb53ce501407098543a0a56068e1`. #746 reste inchangée. Aucun merge, changement de sécurité ou opération de production.

## Défaut reproduit et correction

Avant : un slug existant produit 409 après l'écriture des métadonnées. Deux requêtes concurrentes pour le même slug laissent également le nom/description du perdant modifiés. Le passage PostgreSQL avant correction donne **2 échecs, 1 succès**.

Après : `updateProjectSettings` écrit métadonnées, slug et redirection dans une seule transaction PostgreSQL. Le verrou de ligne sérialise les modifications du même projet et les transferts. La contrainte unique `(organizationId, slug)` arbitre les concurrents de projets différents. Une violation P2002 est convertie en 409 après rollback ; aucun précontrôle de disponibilité n'est utilisé. Le chemin historique `renameProjectSlug` réutilise la même transaction. Les appels à `requireProject(..., 'projects:write')` restent présents.

| Scénario réel | Attendu / observé après correction |
|---|---|
| Slug déjà pris, deux PATCH combinés | 409 deux fois ; projet strictement identique après nouveau serveur/client Prisma, timestamps compris ; zéro redirection. |
| Succès combiné, répétition, renommage inverse | Nom/description/branche/slug exacts après reconnexion ; une redirection attendue, aucune auto-redirection après retour. |
| Deux projets demandent simultanément le même slug | Un 200, un 409 ; métadonnées et redirection complètes uniquement chez le gagnant ; perdant identique après reconnexion. |
| Transfert gagne le verrou de ligne | Transfert synthétique dans PostgreSQL ; attente réelle de verrou observée dans pg_stat_activity, sans temporisation injectée. La mutation portant l'ancienne organisation est refusée 404. Ancien propriétaire HTTP refusé ; nouveau propriétaire autorisé ; zéro redirection résiduelle. |
| Droits modifiés avant la requête suivante | Admin synthétique autorisé ; viewer 403 ; membre révoqué 404 deux fois ; données inchangées après reconnexion. |

Passage combiné : **24 succès, zéro échec/saut** : 5 nouveaux scénarios PostgreSQL + les 6 de #746 = **11 réels** ; 13 contrats existants en mémoire comptés séparément. Les identités/sessions sont semées dans la base réelle. Le parcours login, UI/BFF, production et fournisseurs ne sont pas testés.

Limite d'autorisation : le verrou de projet protège le transfert d'organisation. Il ne sérialise pas une révocation de rôle pendant une requête déjà autorisée ; la preuve de révocation porte sur la requête suivante. L'audit/activité après commit ne fait pas partie de la transaction de paramètres. Aucune atomicité générale de toutes les routes n'est revendiquée.

## Reçu reproductible sans saut

Provisionner une base locale jetable nommée `panel_proof` et appliquer les migrations du dépôt. Depuis la racine :

```sh
DATABASE_URL=postgresql://postgres@127.0.0.1:55438/panel_proof \
  services/api/scripts/verify-project-settings-postgres.sh /tmp/project-settings-final-proof
```

Le script active explicitement les deux suites PostgreSQL, refuse les tests sautés et exige leurs 11 cas, puis écrit `tests.log`, `tests.json` et `receipt.json` (SHA exact, checkout propre/sale, décompte). Il ne crée pas de fournisseur, d'infrastructure ou d'accès. Aucun workflow modifié ; intégration au job PostgreSQL à coordonner. Une CI standard sans activation ne constitue **pas** cette preuve.

Journaux consultables conservés, sans headers d'autorisation, tokens, mots de passe ni données utilisateur réelles :

- `before-400.log` : défaut 400 de #746, 1 échec/5 succès.
- `green-746.log` : 6 PostgreSQL + 14 contrats en mémoire, 20 succès.
- `before-409.log` : régression 409 sur la base #746, 2 échecs/1 succès.
- `green-atomic.log` : passage combiné après correction, 24 succès.

Le JSON adjacent conserve les empreintes des sources et des journaux. Les timestamps/IDs des journaux sont ceux de données synthétiques.

## Lint et gate de commit — distinction explicite

- **Ciblé nouveau test** : `node_modules/.bin/eslint services/api/src/project-settings-atomic.integration.spec.ts`, sans exemption.
- **Ciblé sources serveur** : comparaison à `e02bcab...` par ESLint avec `lintText(git show SHA:path)` et mêmes options/configuration. Les diagnostics préexistants ne sont pas corrigés en masse. #746 comparait app.ts à la base exacte `4af4dd...` : 366 erreurs/13 avertissements des deux côtés.
- **Global réellement exécuté** : `node_modules/.bin/eslint --cache --cache-location ./node_modules/.cache/eslint app --format json` : **0 erreur, 51 avertissements, code 0**. `package.json` définit exactement cette cible `app` ; sources, config et lockfile identiques entre base et lots. L'expression « lint global rouge » du premier compte rendu #746 était incorrecte ; seul le lint ciblé serveur était rouge. Description PR corrigée sans changer son SHA.
- **Gate commit** : `.husky/pre-commit` existe, mais n'était pas installé/actif (`core.hooksPath` absent ; `.git/hooks` uniquement fichiers `.sample`). Le commit ordinaire n'a pas exécuté ce gate. Aucun `--no-verify`, `HUSKY=0`, modification de hook ou exemption de règle. Les validations ont été exécutées explicitement ; aucune réussite du hook n'est revendiquée.

Tâches planifiées : travail interrompu à la demande de la revue, conservé dans le stash nommé `scheduled task PostgreSQL proof pending priority settings fix` et dans `/tmp/scheduled-task-persistence.parked.spec.ts`. Non publié et non validé ; aucun changement de son exécuteur.
