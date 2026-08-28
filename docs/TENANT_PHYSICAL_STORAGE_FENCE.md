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

Managed Postgres is part of the same irreversible operation. Before
`EFFECT_STARTED`, one short transaction captures every `DatabaseInstance`,
`DatabaseSnapshot`, and `DatabaseRestore` row and commits an immutable
`ProjectDatabaseErasurePlan`. The plan fixes the ownership epoch, CNPG object
names, shared-tier database/role names, backup bucket, and the exact
`db/<projectId>/` generation prefix behind a SHA-256 inventory commitment. The
plan and its append-only evidence survive the final `Project` cascade through
the object-storage operation, so the database receipt remains a forensic
preimage.

Provider work then runs outside Prisma transactions in this order:

1. the workspace manager inventories and deletes tenant-owned CNPG resources
   under the live object-storage lease and exact Kubernetes
   `resourceVersion`;
2. shared-tier SQL drops only the plan-bound database and role, using the
   non-tenant CNPG administrator connection;
3. GCS deletes every concrete object generation below the immutable project
   database prefix;
4. a separate read-only pass proves CNPG resources, shared database/role, and
   every backup generation absent.

Each completed stage is appended to `ProjectDatabaseErasurePlan.evidence`.
Only the final read-only pass may persist `stage=VERIFIED`, `verifiedAt`, and the
immutable provider receipt. The permanent-delete finalizer locks that row and
requires an exact receipt match before deleting `Project`; a caller-supplied or
partially reconstructed receipt cannot pass. Recovery of an
`EFFECT_STARTED`/`VERIFYING` operation is verify-only: it never repeats a
provider mutation whose acknowledgement may have been lost.

### CNPG deletion authority

The API must have `DB_BACKUP_BUCKET` and billing-tier authority before it claims
the operation. The workspace manager must be reachable through its authenticated
manager secret and its `project-databases` Role must allow:

- `get/list/watch/delete` on CNPG `clusters`, `databases`, `scheduledbackups`,
  and `backups` (normal provisioning additionally needs create/update/patch);
- `get/list/watch/delete` on CNPG-owned Pods, Services, Endpoints,
  EndpointSlices, ConfigMaps, ServiceAccounts, PVCs, Deployments, Jobs, and
  PodDisruptionBudgets;
- Secret reads plus the existing shared-tier Secret write authority, with
  delete used only by the fenced permanent-delete endpoint.

The GCS runtime identity must be able to list object versions and delete an
exact generation in `DB_BACKUP_BUCKET`. Bucket versioning does not weaken the
proof: verification lists generations, not only live object names. Do not grant
the API Kubernetes credentials; CNPG inventory and deletion stay behind the
workspace-manager boundary.

### Durable recovery protocol

For `MANUAL_RECOVERY`, an expired lease is not deletion evidence. Keep the
Project fence installed and use the following protocol:

1. record the operation ID, project/organization snapshots, ownership epoch,
   immutable plan JSON, `inventorySha256`, current stage, evidence, and last
   error in the incident record;
2. restore the missing authority (manager authentication/RBAC, CNPG API,
   administrator Secret, or GCS generation-list/delete access). Never edit the
   plan, evidence, receipt, operation status, or `Project` deletion columns;
3. independently compare live state to the exact plan: no direct or
   `cnpg.io/cluster` descendant resource, no plan-named shared database or role,
   and no object generation below the plan-bound bucket/prefix;
4. retry the original permanent-delete request with the same idempotency key
   after the old lease expires. Recovery revalidates tenant and inventory
   commitments and performs only the read-only verification pass;
5. archive the committed `ProjectPermanentDeletionReceipt` and linked
   `ProjectDatabaseErasurePlan` receipt. Escalate any digest, tenant, ownership
   epoch, or live-inventory mismatch; do not manufacture a replacement receipt.

If any authority is unavailable, the API returns a retryable failure and leaves
the durable fence/plan in place. That state is intentionally operationally
blocked but immediately safe: there is no code path that turns an unavailable
provider into an absence receipt.

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
