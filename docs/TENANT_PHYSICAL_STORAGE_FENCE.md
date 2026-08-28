# Tenant physical-storage fence runbook

This runbook covers project ownership transfer, permanent deletion, local/NFS
storage, and bucket-per-project object storage. The invariant is strict: a
request authorized for organization A must neither read nor write project bytes
after the project ownership commit to organization B.

## Lock and validation order

Project IDs are deduplicated and sorted before every multi-project operation.
The order is:

1. PostgreSQL **session** advisory physical lock(s), held on one dedicated
   `pg.Pool` client for the full effect;
2. a short transaction taking purge topology shared, object-storage locks when
   applicable, checkpoint, then `Project` row locks, followed by tenant and
   deletion-state validation;
3. NFS project lock(s), in the same sorted project order;
4. a fresh short tenant/checkpoint/`Project` validation while NFS is held;
5. the physical effect; object-provider effects run outside Prisma transactions;
6. live verification and a short final transaction in the same database lock
   order.

The NFS lock renews its token-owned inode mtime while an effect is active. The
180-second stale interval is crash recovery, not a maximum effect duration. A
dead process stops heartbeating and its lock becomes reclaimable; release and
heartbeat never unlink or refresh a different owner's token.

Account purge keeps its mature order: it commits an exclusive topology and
object-storage freeze first, then performs physical/NFS erasure outside that
transaction. A pre-freeze writer finishes before erasure; every later writer
sees the durable freeze. Purge acquisition never waits for NFS while holding the
topology transaction, so it does not invert the project writer order.

## PostgreSQL session-lock pool

`PROJECT_PHYSICAL_LOCK_ACQUIRE_TIMEOUT_MS` bounds only acquisition of the
session advisory lock (default 60 seconds, clamped to 1 second–15 minutes).
After acquisition, `statement_timeout` is reset to zero: long Git, filesystem,
provider, and cleanup effects do not lose their lock because an interactive
transaction timed out. These connections come from a dedicated `pg.Pool`; no
idle Prisma transaction is held across I/O. Unlock is reverse-order. Any unlock
or timeout-reset uncertainty destroys the connection, which makes PostgreSQL
release all session locks.

An acquisition timeout returns `503 PROJECT_LOCK_TIMEOUT` and executes no
effect. A process or connection death releases the session lock; the mandatory
second tenant validation under NFS prevents a stale request from proceeding
after that failure.

## Signed object-storage capabilities

The bucket name is derived from the immutable project ID. Deleting a bucket is
not enough to revoke an old signed URL because a later bucket with the same name
would reactivate it. Every signed upload or download therefore reserves a
PostgreSQL-clock expiry upper bound in `Project.objectStorageCapabilityExpiresAt`
before signing. Project transfer returns
`409 PROJECT_TRANSFER_OBJECT_STORAGE_CAPABILITY_ACTIVE` until that timestamp is
in the past.

Object-storage commands use a durable operation record and short prepare/verify/
finalize transactions. Provider I/O is never performed inside a Prisma
transaction. An ambiguous started operation enters manual recovery and remains a
transfer/purge fence; operators must verify provider evidence before reclaiming
it. When the configured object-storage backend is inactive, transfer and
permanent deletion fail closed with
`503 PROJECT_OBJECT_STORAGE_BACKEND_UNAVAILABLE`; a disabled adapter is not
proof that a historical bucket is absent.

Transfer also requires a live `bucketExists=false` probe while its physical and
NFS barriers are held. The final transaction revalidates source organization,
capability expiry, operation state, checkpoints, target admission/quota, and all
managed-resource deny-set rows before changing `Project.organizationId`.

## Expected transfer refusals

- `409 PROJECT_TRANSFER_OBJECT_STORAGE_CAPABILITY_ACTIVE`: wait until the
  recorded database-clock expiry passes.
- `409 PROJECT_TRANSFER_OBJECT_STORAGE_ACTIVE`: delete the bucket and verify it
  absent using the active provider.
- `409 PROJECT_TRANSFER_MANAGED_RESOURCES_ACTIVE`: detach every managed runtime,
  deployment (including failed/canceled rows), database, template, AI
  conversation, share, checkpoint, and release resource.
- `409`/`423` checkpoint or purge fence: finish or release the durable operation;
  never bypass it.
- `503 PROJECT_OBJECT_STORAGE_BACKEND_UNAVAILABLE`: restore provider
  configuration before retrying.

## Permanent deletion and cold start

Permanent deletion first installs an irreversible, tenant-fenced deletion
operation. It then erases and live-verifies the project tree,
`_objects/exports/<projectId>`, `_objects/snapshots/<projectId>`, and the GCS
bucket while physical/NFS barriers remain held. The `Project` row is deleted only
after every class proves absent. The deletion receipt and org-scoped audit row
commit atomically with that delete, allowing an identical lost response to
replay without repeating effects. Restore refuses a project whose permanent
deletion has started.

Static-artifact evidence is stored as sorted counts plus a SHA-256 commitment,
not as an unbounded copy of every disposition. This keeps large deletion
receipts bounded and tamper-evident. The receipt remains independently
queryable after cascade, but it is not a forensic preimage: the child manifest
rows used to construct the commitment are intentionally removed with the
project.

Workspace cold start persists tenant-fenced `STARTING` before calling the
workspace manager. If transfer commits first, no manager request is sent. If the
`STARTING` latch commits first, transfer refuses the active runtime. Manager
failure is logged but never causes a fail-open retry under stale tenant
authority.

## Incident checks

For a stuck operation, inspect the durable operation/receipt state, owner token,
fencing token, lease, provider evidence, reserved capability expiry, and current
project organization. Do not clear `EFFECT_STARTED`, `VERIFYING`, or
`MANUAL_RECOVERY` based only on lease age. Re-run live provider/local inventory
under the operation's fences; finalize only from verified evidence. Never repair
by directly changing `Project.organizationId`, `deletedAt`, capability expiry, or
operation state.
