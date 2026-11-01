# Backup provenance compatibility — 2026-11-01

This change is stacked on PR #875 (`35fbb5a4b05789f93543966839381df0078595df`). That PR is unchanged. This record separates local software evidence from cloud evidence; no production resource, credential, permission, restore flag or network policy was changed.

## Deployment risk and scope

**Do not deploy #875 alone expecting existing on-demand backup workflows to pass its new verification.** A generated project CUID and snapshot CUID each contain 25 characters. Their old backup names contain 54 characters in development and 59 in production, then are truncated to 53. Migration IDs (`mig_<execution CUID>`) also contain an invalid DNS underscore and produce 58/63-character names. Checkpoint IDs (`ckdb_<UUID slice>`) contain an underscore even without truncation. See `names.json`; integration tests also use actual Prisma-generated CUIDs.

| Path                                                               | Impact of #875 alone / old creation                                                                                                                          | Correction and remaining restriction                                                                                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Project publish with SQL migrations and a production DB connection | Backup verification refuses ambiguous names; publish migration fails closed. It also previously requested/polled development despite a production execution. | Persist provenance and immutable UID, valid v2 names, propagate the validated environment to creation and every poll. Local transaction/DDL proves production selection. |
| Manual and automatic application snapshots                         | Old 202/counts could acknowledge an unconfirmed request; truncated backup cannot be verified.                                                                | Manual failure returns 503 with snapshot ID; scheduler counts only accepted requests. Accepted creation is not proof of archive completion.                              |
| Checkpoint backups                                                 | Underscore is invalid for a Kubernetes resource name.                                                                                                        | Hash the complete project/snapshot/environment tuple into a 47-character DNS name; logical checkpoint ID remains intact in provenance.                                   |
| Existing legacy Backup objects                                     | Identity cannot be reconstructed from truncated names.                                                                                                       | Leave objects untouched; refuse unlinked legacy objects. No retroactive adoption/backfill based only on labels or names.                                                 |
| CNPG daily ScheduledBackup                                         | Existing schedule name is separate from these on-demand IDs.                                                                                                 | Schedule manifests unchanged; their backups are not automatically adopted as application provenance.                                                                     |
| Shared-tier per-project Database resources                         | No independently identified per-project Cluster.                                                                                                             | Still refused by this isolated-Cluster path; this change does not implement shared-tier backup/restore.                                                                  |
| Platform rollout; publish without SQL migrations                   | No unconditional block established by the name defect.                                                                                                       | Actual deployed flags, manager capability and cloud resources were not inspected.                                                                                        |

Required coordinated rollout: apply additive control-plane migration **0093**, deploy the workspace-manager with the create-only Backup endpoint, then deploy the API containing #875 plus this correction. An older manager or missing provenance repository fails closed. Review and validate the final combined commit after any rebase/merge. Existing Helm RBAC already declares Backup create/get; no RBAC change is included and actual production authorization is unverified. Do not enable production restoration.

## Durable identity and refusal behavior

Before creation, a PostgreSQL transaction reserves an immutable intent with nonce, project, organization, instance, environment, binding version, source Cluster name/UID and complete logical snapshot ID. It locks Project then DatabaseInstance and checks active ownership/binding, deletion and active restore admission. The backup name is `bkp-v2-` plus 40 SHA-256 hex characters of the complete tuple. A hash collision or pre-existing foreign object cannot be adopted because full context and nonce must match.

The existing authenticated database bridge gains a strict Backup-only create endpoint. Its kubectl client uses `create`, never apply/replace/delete. The response UID is pinned once using a compare-and-set transaction. A conflict or lost acknowledgement may only reconcile the exact persisted intent with matching metadata. A bound but missing object is never recreated. Polling revalidates source UID and current context; transfer, binding changes, deletion, restore admission, UID replacement, truncated/case-folded source names and contradictory failure status are refused.

## Reproducible local evidence

Use an explicitly disposable local PostgreSQL 16 database. The test fixtures reject non-loopback/unapproved database names. `RESTORE_TEST_DATABASE_URL` is supplied by the operator and is never copied to this repository. Migrate with the repository Prisma CLI, then run from `services/api`:

```sh
../../node_modules/.bin/vitest run \
  src/tests/database-restore-repository.spec.ts \
  src/tests/database-provisioning-transfer.prisma.spec.ts \
  src/tests/database-restore-consumer.spec.ts \
  src/tests/database-restore-distributed.spec.ts \
  src/tests/database-backup-provenance.spec.ts \
  src/tests/database-backup-workflows.spec.ts \
  --maxWorkers=1 --no-file-parallelism
```

The CI runner now requires all six suites to execute, without skips, against its owned temporary PostgreSQL database. Local run: **99 passed, zero failed/skipped**. This includes two-process fencing, repository concurrency, 12 concurrent intent reservations, UID CAS, context races and fresh-client persistence. The workflow suite uses real PostgreSQL, real loopback HTTP and the actual manager client, with explicitly controlled CNPG metadata objects; it tests CUID manual/automatic snapshots in both environments, checkpoint IDs, production migration DDL/replay, simultaneous create and acknowledgement loss. No physical CNPG backup or GCS archive is produced by these fixtures.

Additional checks: CI runner contract **29 passed**; i18n suites **28 passed**; global typecheck and i18n catalog/source validation passed. Adapter/provisioner/integrity, manager and kubectl tests are recorded in `results.json`. An initial invocation of the i18n Vitest suites with Node's native runner failed due to the wrong runner; the correct Vitest invocation passed. Existing generated Prisma declaration whitespace is generator output, not handwritten code formatting.

## Evidence still required before cloud restoration

This removes a software identity/creation blocker; it does not establish cloud recoverability. Still required: a separately authorized disposable CNPG/GCS test target with existing scoped access, actual Backup and WAL archive evidence, restore from those bytes, exhaustive production consumer fencing and validated target-binding cutover. Production restore remains 503 until those requirements are satisfied. Do not infer production readiness from controlled metadata marked `completed`.

The earlier Stripe sandbox and CNPG/GCS post-deployment procedures remain in [PR #873](https://github.com/openaxcloud/vibecore/pull/873), under `docs/qa/launch-load-20261101/`; their missing access/proofs are not silently supplied by this change. No real payment, paid AI, cloud resource or production load test was performed.
