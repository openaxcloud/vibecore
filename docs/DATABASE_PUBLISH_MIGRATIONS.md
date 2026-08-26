# Production database migrations at publish time

E-Code runs project-owned PostgreSQL schema migrations before it creates a
production publication. The gate is fail-closed: a publication is not created
unless the exact migration plan is backed up, applied transactionally, fenced by
a live control-plane lease, and verified from the target ledger.

## Project contract

Migration files live directly under `migrations/`. A project that contains SQL
files must also contain `migrations/ecode.publish.json`:

```json
{
  "schemaVersion": 1,
  "mode": "expand",
  "backwardCompatible": true,
  "forwardCompatible": false,
  "migrations": [
    {
      "name": "001_create_customers.sql",
      "sha256": "<lowercase SHA-256 of the exact file bytes>"
    }
  ]
}
```

Order is significant. Names must be unique flat `.sql` filenames and every SQL
file must be declared. A changed byte or an undeclared file refuses the publish.
The automatic path accepts a deliberately small expand-only policy: new tables,
non-concurrent indexes, added columns or constraints, enum types, and comments.
Destructive DDL/DML, arbitrary functions/procedures, table copies/inheritance,
renames, type changes, and `SET NOT NULL` require a separately reviewed rollout.

Projects without migration files keep the existing publish path and do not create
a migration execution.

## Runtime guarantees

- A PostgreSQL-clock lease and unique active lock allow one migration owner per
  project/environment. Renewal refuses an already expired lease.
- An on-demand production CNPG backup must report the terminal `completed` phase;
  acceptance of the Backup custom resource is not sufficient.
- Target SQL runs in one PostgreSQL transaction under a target advisory lock.
  The lease is revalidated immediately before `COMMIT`.
- `_ecode_schema_migrations` stores the immutable filename/hash ledger in the same
  transaction as the DDL. A reused name with different bytes is rejected.
- If the COMMIT acknowledgement is lost, the exact target ledger is reread. A
  complete matching ledger finalizes the execution; partial, mismatched, or
  unavailable state blocks publication for operator review.
- The production publication entitlement is checked before schema mutation and
  rechecked authoritatively under the organization lock before publication.

The control plane persists only names and hashes, never project SQL or database
credentials. Audit events contain the execution ID and aggregate statement hash.

## Recovery

`FAILED_SAFE` means PostgreSQL confirmed rollback; the same idempotency key is not
silently reported as success. Create a reviewed follow-up deployment after fixing
the migration. `MANUAL_RECOVERY` means the target could not be proven empty or
complete and must not be retried blindly.

For manual recovery:

1. Keep publication blocked and preserve the `DBMigrationExecution` row.
2. Inspect `_ecode_schema_migrations` using the production database's tenant role.
3. Compare every ordered `name`/`sha256` with the persisted `plan`; do not edit the
   ledger to force a match.
4. Verify the CNPG backup named by `backupId` is completed and restorable.
5. Retry the same publish only after the target is readable. The retry acquires a
   fresh DB-clock lease and rereads the exact ledger: it finalizes a complete match,
   safely reapplies an empty transactional target, and keeps partial/mismatched or
   unavailable targets blocked for database-operator review.

The feature does not make MySQL/SQLite DDL transactional and refuses those engines
with `MIGRATION_ENGINE_UNSUPPORTED`.
