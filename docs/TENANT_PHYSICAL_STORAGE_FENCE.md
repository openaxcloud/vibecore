# Tenant physical-storage fence runbook

This runbook covers project ownership transfer, permanent deletion, local/NFS
storage, and bucket-per-project object storage. The invariant is strict: a
request authorized for organization A must neither read nor write project bytes
after the project ownership commit to organization B.

## Lock and validation order

Project IDs are deduplicated and sorted before every multi-project operation.
The order is:

1. for permanent deletion or account-purge static erasure, the global static
   last-reference session lock and its heartbeat NFS lock;
2. PostgreSQL **session** advisory project physical lock(s), held on one dedicated
   `pg.Pool` client for the full effect;
3. a short transaction taking purge topology shared, object-storage locks when
   applicable, checkpoint, then `Project` row locks, followed by tenant and
   deletion-state validation;
4. NFS project lock(s), in the same sorted project order;
5. a fresh short tenant/checkpoint/`Project` validation while NFS is held;
6. the physical effect; object-provider effects run outside Prisma transactions;
7. live verification and a short final transaction in the same database lock
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

For each project owned through a sole-member organization, account purge drives
the normal `PROJECT_PERMANENT_DELETE` saga with an idempotency key bound to the
parent plan. The child claim accepts only an ephemeral authority whose plan,
owner token, PostgreSQL-clock lease, project/org/name/ownership epoch, request
hash, and frozen inventory all match in the claim transaction. The parent never
bulk-deletes `Project` rows. It independently reads every immutable child
receipt and verifies the absent Project, operation kind/status, canonical
request, tenant snapshot, and ownership epoch before anonymizing the user.
The transition to `EFFECT_STARTED` locks and revalidates the parent plan and
conditions the child update on the same live lease. A rejection is therefore
provably pre-dispatch and restores the child safely. Once that transition
commits, the immutable child scope and its own fencing token become the recovery
authority: an expired or reclaimed coordinator lease cannot interrupt or
misclassify a provider effect that may already be in flight.
Residual subject workspaces in shared projects remain a separate account purge
class; sole-owned trees, buckets, static bytes, and provider resources are not
sent through that residual path a second time.

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

### Version-history retention and collection

An ACTIVE remix storage share retains the exact `(key, generation)` set stored
in its consent inventory. Source buckets are versioned before the share becomes
ACTIVE, and source DELETE/MOVE/overwrite commands reject every retained
generation. Versioning is not left as an unbounded cost sink:

- signed PUT authorization advances both the project capability upper bound and
  a durable `ObjectStorageVersionGcSchedule` in the same short transaction;
- share creation schedules collection, and revoke/delete expedites it without
  lowering a future capability bound;
- the reap endpoint claims at most 500 exact noncurrent generations into
  `ObjectStorageOperationPinnedGeneration` rows, holds the physical/NFS fence,
  deletes by provider generation, and verifies live absence outside all Prisma
  transactions;
- ACTIVE share generations and current generations are never candidates. When
  no ACTIVE share and no noncurrent generation remain, the worker verifies that
  state and disables bucket versioning;
- a crash after any provider delete keeps the project frozen. The next sweep
  reclaims the expired operation for verify-first recovery, reads the normalized
  generation batch, deletes only still-present candidates, and finalizes the
  receipt with the same operation and schedule fences.

`PENDING` schedules use PostgreSQL `notBefore` as a hard lower bound. A new
capability can only move that bound later; revoke can move `nextAttemptAt`
earlier but never below the bound. `CLAIMED` schedule leases heartbeat in the
same transaction as their provider-operation lease. Deterministic authority or
inventory mismatches move both records to manual recovery; transient provider
errors persist bounded backoff so one poison project cannot starve the keyset
sweep. Project transfer refuses every pending, claimed, or manual version-GC
schedule, because historical generations still belong to the source tenant.

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

Static-artifact evidence is stored in two layers. The receipt contains sorted
counts plus a SHA-256 commitment, keeping its JSON bounded even for more than
10,000 content-addressed releases. Before any effect, the complete canonical
preimage is inserted in 500-row batches into
`ProjectPermanentDeletionArtifactPlan`; those rows survive the Project and
ReleaseManifest cascade through the durable operation. Finalization re-derives
the receipt commitment from that normalized ledger before changing each row
from `PLANNED` to `DELETED` or `RETAINED`.

All project permanent deletions and account-purge static erasures hold one
cross-project session+NFS last-reference barrier through their final database
commit. Per-digest erasure uses the same static-deployment lock as publishing.
Consequently two projects sharing one digest cannot both retain it based on the
other's soon-to-be-cascaded manifest: the first deletion commits its cascade,
then the final owner observes zero other references and removes the bytes.

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

For a stuck account purge, inspect the parent `PurgePlan` and each expected
`ProjectPermanentDeletionReceipt`. A lost parent response reuses the same child
idempotency key and receipt; never create a replacement project-delete key or
fall back to relational `Project.deleteMany`. Until COMPLETED, the plan inventory
retains the exact child identity required for recovery. On COMPLETED it is
reduced to receipt identifiers and hashes, and the topology fingerprint is
one-way committed so plaintext project names are not retained in purge history.
After any parent or child effect is dispatched, the durable `PurgeFreeze` rows
remain authoritative even if lease reconciliation marks the attempt FAILED or
ABANDONED. Reclaim the same plan and verify its receipts; deleting freeze rows or
treating a non-ACTIVE status as permission to resume writes is not a recovery.
Before the first guarantee is issued, the coordinator also refuses foreign
active physical-storage operations and active Remix retained-source shares for
every sole-owned project. Resolve those authorities first; never let the parent
start billing or erasure effects and hope a mismatched child receipt can be
adopted later.
That reclaim also reuses the original, runtime-validated inventory and topology
commitment. It must not rebuild `ownedProjects` from the surviving relational
rows, because a successfully erased child is intentionally absent by then.
