# DATABASE_CONTRACT — base de données managée par projet (audit v4 I)

schemaVersion: 1
repoCommit: ca299f87

Contrat de la DB managée d'un projet (Postgres CNPG) + la machine de migration.

## Faits (cf. mémoire database-cnpg + db-project-binding)

- Postgres managé via **CNPG** (v1.29.1), ns `project-databases`. SQL pane R/W
  live. `DATABASE_URL` seed via reconcile ; bind final = 1 GET authed.
- Déploiement server câble les credentials Production dans l'app publiée
  automatiquement (split dev/prod).

## Machine de migration (audit v4 E — `lifecycle-state-machines.ts`)

```
PLANNED → LOCK_ACQUIRED → BACKUP_VERIFIED → APPLYING → VALIDATING → COMMITTED
échec → FAILED_SAFE | FORWARD_FIX_REQUIRED | MANUAL_RECOVERY
```

- **I-MIG-1 (backup avant apply)** : `APPLYING` exige `BACKUP_VERIFIED`
  (`MIGRATION_APPLY_BEFORE_BACKUP`) — sinon perte de données irrécupérable.
- **I-MIG-2 (une active par env)** : `migrationMayStart` refuse une 2e migration
  active dans le même environnement.
- **I-MIG-3 (compat explicite)** : `backwardCompatible`/`forwardCompatible`
  (`boolean|UNKNOWN`) portés par la migration, jamais supposés.

## Invariant transverse

- **I-DB-1 (rollback ≠ inversion DB)** : un rollback d'image ne suppose JAMAIS la
  DB inversée (I-REL-2). La compat schéma est gérée par la migration, pas par le
  rollback.

## 🟡

Free-tier admin-SQL + réconciliateur d'hibernation = gaps connus (CNPG). Preuve
e2e de migration (stage vertical) = follow-up.
