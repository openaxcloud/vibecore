# DATABASE_CONTRACT — base de données managée par projet (audit v4 I)

contractId: CTR-DATABASE
contractVersion: 2
schemaVersion: 2
repoCommit: f40e75c3
reviewer: UNKNOWN
expectedReviewer: OpenAI-Codex
signatureResult: PENDING_REVIEW   # v1 REFUSED sur P0-V3-11 (« contrat sans DBMigrationExecution, clé idempotence ni protocole complet mutation PROD ») ; v2 = DBMigrationExecution câblée + migration réelle au Publish + refus prouvés
implementationAnchor: "PR feat/p0-v3-11-db-migration-publish : table DBMigrationExecution (mig 0082) + exécuteur db-migration-execution.ts + applicateur transactionnel db-migration-applier.ts, câblés dans POST /projects/:id/deployments/:id/publish AVANT la création du déploiement de production"

Contrat de la DB managée d'un projet (Postgres CNPG) + la machine de migration.

## Faits

- Postgres managé via **CNPG** (v1.29.1), ns `project-databases`. SQL pane R/W
  live. `DATABASE_URL` seed via reconcile ; bind final = 1 GET authed.
- Split dev/prod : `DATABASE_URL` (développement) et `PROD_DATABASE_URL`
  (production), `@@unique([projectId, environment])` sur `DatabaseInstance`.

## Machine de migration — CÂBLÉE (v2)

```
PLANNED → LOCK_ACQUIRED → BACKUP_VERIFIED → APPLYING → VALIDATING → COMMITTED
échec → FAILED_SAFE | FORWARD_FIX_REQUIRED | MANUAL_RECOVERY
```

En v1 cette machine existait en module **pur, importé par son seul test** : aucun
modèle, aucune route, aucun exécuteur. C'est le refus P0-V3-11. En v2 elle porte
une exécution réelle, persistée dans `DBMigrationExecution` (migration 0082).

### I-MIG-1 — backup VÉRIFIÉ avant d'appliquer

`APPLYING` exige `BACKUP_VERIFIED` (`MIGRATION_APPLY_BEFORE_BACKUP`). « Vérifié »
signifie que **l'aboutissement du backup a été observé** — phase CNPG
`completed`, lue sur le CR `Backup` via `provisioner.backupStatus()`.

Avant v2 c'était impossible : `takeSnapshot` rendait la main dès le CR accepté et
personne ne relisait jamais son statut. « Backup vérifié » n'aurait voulu dire que
« backup demandé ». Sans preuve d'aboutissement, la migration est **refusée**
(`MIGRATION_BACKUP_UNVERIFIED`) et **aucune instruction n'est exécutée** — y
compris quand le provisionneur est inerte.

### I-MIG-2 — une seule migration active par environnement

Le verrou est la colonne `activeLock` (`<projectId>:<environment>`) sous **index
UNIQUE**. Postgres traitant les NULL comme distincts, autant d'exécutions
terminées que voulu coexistent, mais une seule active par (projet, env).

C'est le **SGBD** qui arbitre, pas l'application : `migrationMayStart(active[],
env)` — la primitive v1 — décide à partir d'une liste en mémoire, ce qui laisse
une fenêtre de course entre le SELECT et l'INSERT et ne voit pas les autres
replicas (l'API tourne en 2, HPA → 6). Une 2e migration concurrente reçoit une
violation d'unicité, traduite en `MIGRATION_LOCK_HELD` (409).

Le verrou est **toujours relâché** (succès comme échec) : un verrou resté pris
bloquerait définitivement les migrations du projet.

### I-MIG-3 — compatibilité déclarée, jamais supposée

`backwardCompatible` / `forwardCompatible` ∈ {`true`,`false`,`UNKNOWN`}, portés
par l'exécution. Non renseignés ⇒ `UNKNOWN`, jamais un défaut optimiste.

### Clé d'idempotence

`@@unique([projectId, idempotencyKey])`. Au Publish la clé vaut
`publish:<deploymentId>:<empreinte du lot>` : republier le même déploiement
rejoue la même clé et **ne ré-applique rien** ; un lot modifié produit une clé
différente. Second garde-fou **dans la base du projet** : le registre
`_ecode_schema_migrations` fait sauter toute migration déjà appliquée.

## Protocole de mutation PROD au Publish

1. Le projet déclare ses migrations dans `migrations/*.sql` (ordre
   lexicographique). Sans fichier, le publish suit son cours inchangé.
2. La migration s'exécute **AVANT** la création du déploiement de production.
   Un échec **refuse le publish** (409) et la production continue de servir la
   version précédente. L'ordre inverse — publier puis migrer « au mieux » —
   exposerait une application neuve à un schéma non préparé.
3. Cible injoignable (`PROD_DATABASE_URL` absente) alors que des migrations sont
   déclarées ⇒ refus `MIGRATION_TARGET_UNAVAILABLE`.
4. L'Agent ne mute jamais PROD : la migration part du publish, sous identité
   utilisateur, tracée en audit (`database.migration.publish`).

## Comportement sous échec

| Situation | État | Ce qui est affirmé |
|---|---|---|
| Backup non abouti / échoué / non lançable | `FAILED_SAFE` | Rien n'a été exécuté |
| Erreur pendant l'application | `FAILED_SAFE` | ROLLBACK effectué, **base inchangée** |
| COMMIT non confirmé | `MANUAL_RECOVERY` | État **indéterminé**, dit tel quel |
| Verrou déjà tenu | — (aucune exécution créée) | Refus antérieur à toute action |

Atomicité : en PostgreSQL le DDL est transactionnel — tout le lot tourne dans UNE
transaction, donc un échec à mi-parcours défait aussi les migrations déjà
appliquées **et** l'écriture du registre. Ils ne peuvent pas diverger.

`MANUAL_RECOVERY` est distinct de `FAILED_SAFE` **à dessein** : annoncer « base
inchangée » quand le COMMIT n'a pas été confirmé serait une affirmation non
fondée.

## Moteurs

**PostgreSQL uniquement.** MySQL committe implicitement sur DDL : un échec
partiel y laisserait un schéma à moitié muté, l'inverse de la garantie annoncée.
Le moteur est donc **refusé** (`MIGRATION_ENGINE_UNSUPPORTED`) plutôt que traité
comme équivalent.

## Invariant transverse

- **I-DB-1 (rollback ≠ inversion DB)** : un rollback d'image ne suppose JAMAIS la
  DB inversée (I-REL-2). La compat schéma est gérée par la migration.

## Preuves

- `db-migration-execution.spec.ts` — machine et **refus** : sans backup vérifié
  (4 variantes dont le provisionneur inerte), 2e concurrente, idempotence,
  `FAILED_SAFE`, `MANUAL_RECOVERY`, moteur non supporté.
- `db-migration-applier.integration.spec.ts` — **vrai PostgreSQL 16** : un lot
  échoué à mi-parcours ne laisse aucune trace et les données préexistantes sont
  intactes ; puis **publish réel bout-en-bout** (route HTTP + applicateur réel)
  créant réellement le schéma.
- `db-migration-publish.spec.ts` — route Publish : refus 409 **avant** la
  création du déploiement de production.

## Dépendances ouvertes (déclarées, pas gonflées)

1. **Restaurabilité du backup non prouvée** — `phase: completed` atteste que le
   backup a abouti, **pas** qu'un restore réussirait. Le prouver demande un
   drill PITR réel (même limite que P0-V3-09).
2. **Migration live prod non jouée** — les preuves ci-dessus tournent sur un
   PostgreSQL réel local, pas sur un CNPG de production.
3. **Pas de rollback de schéma** — un `FAILED_SAFE` restitue l'état d'avant par
   ROLLBACK ; il n'existe pas de « down migration ».
4. **Free-tier admin-SQL + réconciliateur d'hibernation** = gaps CNPG connus.

## Résultat de signature

v1 REFUSED (P0-V3-11) · **v2 PENDING_REVIEW**. Le point **reste OPEN jusqu'à
signature expert** : cette version câble la machine, prouve les refus et la
non-corruption sur un moteur réel — elle ne prétend pas clore le sujet.
