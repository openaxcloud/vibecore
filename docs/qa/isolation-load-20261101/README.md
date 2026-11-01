# Isolation et petite charge locale — 1 novembre 2026

Base : `a9f8b02b737e775b68a34d29e33124e5662ec63c`. Aucun accès production,
aucun appel IA ou paiement. Les modifications de cette passe concernent le test
adversarial, pas le comportement applicatif.

## Défaut démontré et corrigé

Trois sondes de `adversarial-cross-tenant.spec.ts` visaient des routes absentes :
`POST /projects/:projectId/secrets`, `PATCH /projects/:projectId` et
`GET /orgs/:orgId/members`. Le témoin propriétaire acceptait le 404 et la sonde
attaquant acceptait même une erreur serveur. La suite pouvait donc rester verte
sans tester ces trois autorisations.

Contre-épreuve : assertion `app.hasRoute` sur les routes paramétrées ajoutée avant
correction des URLs → **3 échecs, 30 réussites**. Les sondes corrigées utilisent
`PUT /projects/:projectId/secrets`, `PATCH /projects/:projectId/settings`,
`GET /orgs/:orgId/memberships`. Les refus admis sont désormais 401/403/404 ; les
témoins propriétaires refusent aussi les 5xx et exigent une route enregistrée.
Résultat final : **33/33**. Aucune fuite applicative n'est démontrée par ce défaut
de test.

## Matrice bornée des preuves

| Critère | Preuve fraîche | Limite / action restante |
| --- | --- | --- |
| Routes inter-organisations et sessions révoquées | 33 tests adversariaux corrigés réussis | Store mémoire ; pas une preuve de toutes les routes ni du réseau runtime |
| Workspaces, déploiements et budgets de débit | 53 tests supplémentaires réussis dans `workspace-isolation`, `deployment-access`, `shared-rate-limit` | Git/fichiers locaux réels pour workspaces ; Redis simulé, pas de preuve multipod Redis |
| Connecteurs persistés | 9 tests `connector-isolation` réussis sur PostgreSQL jetable réellement migré | Exerce contraintes/persistance, pas OAuth fournisseur ni configuration production |
| Symlinks, variables, proxy connecteurs, journaux d'accès | 28 tests réussis dans `project-storage-symlink-containment`, `env-var-scope-routes`, `connector-proxy`, `team-access-log-routes` | Périmètre exact de ces suites uniquement |
| HTTP + PostgreSQL + Git + archive | [Reçu JSON](git-status-load.json) : 30 requêtes mesurées, 10 tours de 3 requêtes concurrentes, 0 erreur, 762 ms cumulés ; 20 fichiers vérifiés ; 2 refus inter-organisations ; persistance après reconnexion/recréation API | Petite charge fonctionnelle locale, pas une capacité de lancement à grande échelle |
| Capacité production et isolation réseau runtime | Aucune nouvelle preuve | Recette dans environnement représentatif isolé avec API/DB/Redis/runtime/preview, montée progressive et durée soutenue ; ne pas inférer capacité depuis `/health` |

Total sans double compte : **123 tests réussis**, dont **9 PostgreSQL**.
Une première passe avait 86 réussites et 9 ignorés faute de PostgreSQL ; les neuf
ont ensuite réellement été exécutés, sans omission. Typecheck API complet réussi.
`git diff --check` réussi. Le lint officiel racine cible `app` ; l'invocation
exploratoire directe d'ESLint sur ce fichier API rencontre des règles déjà
présentes (imports relatifs et espacement), sans nouvelle erreur introduite par
les assertions. Ne pas présenter cette invocation exploratoire comme verte.

## Reproduction et environnement

Les commandes de tests utilisent `node_modules/.bin/vitest run --config
vitest.config.ts` depuis `services/api` (le lanceur pnpm local tentait une
auto-installation hors répertoire autorisé). Le typage utilise
`node_modules/.bin/tsc --noEmit -p tsconfig.json` depuis le même répertoire.

Base jetable `panel_proof`, exposée uniquement sur `127.0.0.1:55438` dans le
conteneur `isolation-launch-proof`. Image épinglée :
`pgvector/pgvector@sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b`.
Toutes les migrations ont été appliquées. L'essai initial sur `postgres:16-bookworm`
a échoué faute d'extension vector ; aucune migration n'a été contournée. Le
conteneur initial jetable a été arrêté avant remplacement.

La recette HTTP existante `services/api/src/git-status-load-proof.mts` exige
`NODE_ENV=test`, l'hôte loopback, le port 55438 et la base `panel_proof`. Elle crée
ses utilisateurs/projet/sessions synthétiques, vérifie chaque archive et nettoie
ses données/fichiers. Les suites connecteurs nettoient également leurs fixtures.
Le conteneur final a été arrêté après les vérifications (suppression automatique
`--rm`, aucune donnée originale). Le reçu conserve le SHA et le hash du code stockage mesuré ; `dirty:true` reflète
le changement du test et la collecte de preuves, pas un correctif du stockage.

Les scripts k6 existants ne suffisent pas à attester une capacité produit : le
baseline ne lit que health/ready/metrics, et les scénarios runtime/IA acceptent
des refus ou une route absente. Aucune exécution de ces scripts contre la
production n'a été faite. Aucune autorisation de charge production n'est déduite.
