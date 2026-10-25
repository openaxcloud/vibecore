# Consommateur PostgreSQL participant — restauration, lot borné

Base : main `941d7d7fc74e2e4f5fa37bbe59d1900f8061adf6`. Aucun changement de capacité cloud, de drapeau, d’accès, de permission ou de déploiement. Ce lot ne constitue pas un adaptateur cloud complet.

## Code réellement ajouté

`services/api/src/database-restore-consumer.ts` prend en charge toutes les requêtes ordinaires d’un consommateur coopérant unique. La quiescence ferme immédiatement l’admission, attend les promesses des requêtes acceptées (y compris celles en attente d’une connexion), puis ferme le pool. La vérification ouvre un nouveau pool, lit l’identifiant système et les données attendues dans une transaction en lecture seule, et compare leur empreinte. La libération exige l’opération, la tentative, la cible déclarée et la version vérifiées. Les erreurs gardent l’application indisponible. Une reconnexion de maintenance au même binding est distincte d’une nouvelle restauration.

L’application QA physique existante utilise ce composant pour ses véritables requêtes PostgreSQL ; son endpoint de relecture renvoie le reçu calculé lors de la vérification, pas une nouvelle lecture SQL. Après libération, `/value` relit réellement les lignes. Les assertions de redémarrage du banc restent présentes avec une reconnexion explicite au binding courant.

## Preuves et contre-épreuves

Le premier essai réel a donné **1 échec / 6 succès** : `pool.end()` seul pouvait annoncer un drainage terminé alors qu’une requête avait déjà été soumise. Le suivi des promesses a corrigé ce comportement. La régression finale soumet trois requêtes pour un pool limité à deux connexions et impose le blocage par un vrai verrou PostgreSQL, sans délai ajouté.

**9/9 tests ciblés réels passent**, sans omission ni retry : drainage, admission fermée, vérification/libération, mauvais digest, mauvaise identité système, mauvaise version, connexion refusée, écriture refusée pendant la vérification et reprise après échec. Un cas lance le véritable processus QA, pilote son IPC et parcourt HTTP avant/après quiescence, vérification, libération et reconnexion au même binding. PostgreSQL existant sur loopback, uniquement tables/schéma synthétiques uniques supprimés par leur fixture. Aucun conteneur/volume créé ; seul le conteneur de test existant, arrêté après reprise de l’environnement, a été redémarré.

Reproduction : définir `RESTORE_TEST_DATABASE_URL` avec le PostgreSQL synthétique autorisé, puis depuis `services/api` :

```sh
node ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts src/tests/database-restore-consumer.spec.ts
```

Sans variable, les neuf cas sont omis : ce résultat ne doit jamais être présenté comme validation réelle. Le CI courant n’injecte pas cette variable pour ce nouveau fichier ; les résultats ci-dessus sont locaux. Aucun test global n’est relancé pour produire ces preuves.

## Revue et limites

La revue indépendante a identifié deux régressions du branchement QA, corrigées avant publication : contrat `/value` après release et reconnexion au même binding après redémarrage. Le test IPC couvre désormais les deux.

- Même serveur PostgreSQL pour les tests locaux : aucune restauration physique, aucun CNPG/GCS/WAL, aucun RPO/RTO démontré.
- `targetId` est fourni par l’adaptateur de confiance ; seul l’identifiant système, le contenu attendu et la version sont contrôlés ici. Un clone partage l’identifiant système de sa source : cela ne prouve pas seul la correspondance cible/URI.
- Pas de fencing distribué, de contrôle des autres processus, ni de fermeture des pools des applications utilisateur. Les commandes de ce composant ne sont exposées par aucune route réseau de production.
- Le rôle local autorise `pg_control_system()` ; les droits du rôle CNPG restent à établir sans les élargir implicitement.
- Le banc physique complet n’est pas exécuté : son image épinglée reste absente. Aucun téléchargement ni substitution.
- L’adaptateur de production doit encore fournir la provenance archive/WAL, une cible attestée, l’inventaire et la quiescence de tous les consommateurs, l’exclusion des anciennes tentatives et le cycle de vie des cibles. La restauration cloud demeure refusée.

La revue a également reproduit une release déjà en file qui rouvrait l’admission après une demande plus récente de suspension (contre-épreuve réelle : 1 échec, 8 succès). Une génération d’admission invalide désormais cette release périmée ; la régression conserve l’assertion de refus immédiat sans délai ajouté.
