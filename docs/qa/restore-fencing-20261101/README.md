# Restore source identity and cooperating-consumer handoff

This branch starts from `ddac2968a` (main after #872). It does not modify #869 or
#873. No cloud request, archive download, paid resource, credential, permission,
network policy or production restore was used. The production 503 remains.

## Concrete changes

1. `CnpgProvisioner.backupStatus` no longer calls a foreign/malformed Backup or
   contradictory `phase=completed` plus error a successful backup. It validates
   kind/API group, namespace/name/UID, project/snapshot labels and source cluster.
   Provider error details are not returned verbatim. This is metadata consistency,
   **not verification of GCS archive bytes or continuous WAL**.
2. Source inspection requires a unique, correctly typed CNPG Cluster owner before
   declaring generation linkage. Wrong-group, malformed and duplicate owners fail.
   An ownerless older resource remains explicitly unlinked, not silently proven.
3. `PostgresRestoreConsumer.fenceAndAdopt(previous,next)` closes admission
   synchronously, invalidates queued releases/verifications, waits for every
   admitted query and closes its pool before adopting the new attempt. Only an
   exact same-operation handoff is accepted. Exact lost-ack replay is idempotent;
   conflicting transfers and recycled/stale tokens are rejected. Adoption never
   reopens admission: fresh verification/reconnection and explicit release remain
   necessary. An in-flight old verification cannot install a pool after fencing.
4. Two real Node processes exercise this participant contract against disposable
   PostgreSQL. A blocked query prevents aggregate drain completion even when the
   other process has acknowledged. A killed participant produces a missing/error
   acknowledgement, never a fence receipt. Data is read through both reconnected
   consumers. This is a test of known cooperating participants, not a production
   registry or cloud fencing service.
5. The existing guarded CI PostgreSQL runner now requires the consumer and
   multiprocess suites as well as repository/ownership suites. All four must run
   with zero skipped/pending assertions. It retains its exact CI service preflight,
   isolated database ownership checks, single-worker execution and cleanup.

## Compatibility restriction: truncated backup names

`backupStatus` now refuses ambiguous truncated Kubernetes names before GET.
Real generated project/snapshot IDs can therefore leave snapshot verification
and the migration guard unavailable. HTTP202 remains kickoff only. The updated
integrity tests explicitly expect refusal; they do not call this backup success.
Durable creation UID/provenance binding is required before safe re-enablement.
No flag or permission change is a substitute. Existing source restore inspection
already refused these ambiguous names; this closes the separate backup-status
path which could otherwise authorize migration without a trustworthy backup.

## Finite proof matrix

| Criterion | Implemented/tested here | Remaining prerequisite |
|---|---|---|
| CNPG metadata identity | Negative wrong-resource/error/owner cases and positive exact identities | Creation UID/provenance persisted at allocation; actual test-cluster observations |
| Archive/WAL integrity | Never reported verified by metadata reader | Authorized test GCS bytes, immutable object generations, archive verifier and continuous WAL proof through target time |
| Local consumer takeover | Real pool drain, token exclusion, queued/in-flight command invalidation, revalidation | Authenticated routing to every real consumer and durable participant identities |
| Multiple known participants | Real separate processes, blocked-query barrier and crash/missing-ack refusal | Exhaustive registry including API SQL, workspaces, generated apps and external/direct consumers |
| Durable predecessor debt | Existing real PostgreSQL journal regressions, stale transition/cutover rejection | Actual external-effect exclusion before acknowledging each journal debt |
| Production cutover | Existing unavailable-route tests; no server coordinator injection added | Reviewed cloud adapter, target UID/binding attestation, all-consumer fencing and isolated cloud failure/recovery drill |

A PostgreSQL journal lock/runner token fences journal transactions. It does not
cancel an old Kubernetes request, stop a workspace SQL client, or prove a remote
backend has drained. Likewise OS process death or lease expiry is not a database
query-completion receipt. This change deliberately leaves the physical QA
`fenceAttempt` unavailable: substituting local acknowledgements there would
misrepresent exhaustive distributed exclusion.

## Architecture decisions still required before production wiring

The repository currently exposes generic restore ports and a CNPG manifest
builder, but no production implementation validating GCS bytes/WAL, attesting a
new target's immutable UID to its connection binding, and excluding every old
external effect. `server.ts` still supplies no restore coordinator.

The next integration must define an authoritative participant inventory and
restart identity, how each mutating external port rejects stale attempts, and
how original allocation UID/provenance survives lost acknowledgements. Direct
SQL clients outside the protocol cannot be made safe by a cooperative in-memory
consumer. Selecting/enforcing that topology is a deployment architecture decision;
this branch does not silently choose new network policies, identities or access.
No production flag should be enabled until those contracts and real test-resource
proofs exist. No cloud integration is configured in this task environment.

## Reproduce the local database checks

Use the already cached PostgreSQL16 image and repository dependencies. The
password is a public synthetic fixture value, never a production credential.

```sh
docker --host=unix:///var/run/docker.sock run -d --rm --name restore-fence-postgres --label vibecore.qa=restore-fence-20261101 --cpus=1 --memory=512m -p 127.0.0.1:55437:5432 -e POSTGRES_USER=restore_proof -e POSTGRES_PASSWORD=local_fixture -e POSTGRES_DB=restore_fence_proof pgvector/pgvector@sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b
docker --host=unix:///var/run/docker.sock exec restore-fence-postgres pg_isready -U restore_proof -d restore_fence_proof
(cd packages/database && DATABASE_URL=postgresql://restore_proof:local_fixture@127.0.0.1:55437/restore_fence_proof ../../node_modules/.bin/prisma migrate deploy)
(cd services/api && RESTORE_TEST_DATABASE_URL=postgresql://restore_proof:local_fixture@127.0.0.1:55437/restore_fence_proof ../../node_modules/.bin/vitest run --config vitest.config.ts src/tests/database-restore-repository.spec.ts src/tests/database-provisioning-transfer.prisma.spec.ts src/tests/database-restore-consumer.spec.ts src/tests/database-restore-distributed.spec.ts --maxWorkers=1 --no-file-parallelism)
docker --host=unix:///var/run/docker.sock inspect --format '{{index .Config.Labels "vibecore.qa"}}' restore-fence-postgres
docker --host=unix:///var/run/docker.sock stop restore-fence-postgres
```

Wait for readiness before migrating. Only stop the owned labeled container.
Do not replace the target with a shared/cloud database. The CI runner deliberately
rejects this local URL; its separate fixed service is configured in `ci.yml`.
An initial manual combined run omitted the CI runner's serialization options and
had one global encryption-corpus fixture interference failure (76/77). Repeating
with the existing required single-worker/no-file-parallelism mode passed 77/77;
no product assertion or CI protection was weakened.

## Recorded validation

[Compact local evidence with assertion names and source hashes](local-evidence.json):

- Red metadata cases: 16 demonstrated failures before correction.
- Metadata/provisioning/migration regressions: 100 passed, zero skipped.
- Four real PostgreSQL suites: 77 passed, zero skipped (30 repository,
  32 provisioning ownership, 13 consumer, 2 multiprocess).
- Coordinator and restore route guards: 43 passed, zero skipped.
- Multiprocess tests rerun after review hardening: 2 passed; these are included
  in the 77, not additional distinct tests.
- CI preflight/report completeness: 29 passed.
- Full API TypeScript check and standalone IPC child typecheck passed.
- Lint passed for new multiprocess files and changed CI runner/contracts; existing
  provisioner lint debt outside the changed method was not claimed resolved.
- Owned disposable PostgreSQL container stopped and removed after checks.

This is 220 distinct API tests plus 29 CI-contract tests. Source hash receipts
refer to measured source contents, not a production deployment. Final GitHub CI
must also pass on the PR's exact head before integration by the coordinator.
