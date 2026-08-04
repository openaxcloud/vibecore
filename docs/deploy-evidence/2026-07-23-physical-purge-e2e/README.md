# Physical account-purge erasure — REAL E2E proof (§16.12, PR #47 reserves)

Real before/after erasure proof on **actual GCS and Kubernetes**, not the memory
adapters the expert rejected. Two independent E2Es, each with the WIF-proof
guardrails: **dedicated TEST resources (never prod), no persistent credentials
(ADC / local kubeconfig), ~$0, full teardown**.

## 1. GCS — `gcs-proof.json` / `gcs-SHA256SUMS`

Runs the production adapter `GcsObjectStorage` driving `eraseSubjectStorage`
against a throwaway bucket in the **dedicated test project `ecode-proof-b906ss`**
(never prod `vibecore-495216`):

- BEFORE: 3 real objects listed in a real bucket `vc-purgee2e…`.
- ERASE: the real erasure path deletes the bucket.
- AFTER (live re-check, reserve #2/#4): `bucketExists=false`, `objectsRemaining=0`,
  `verified=true`.
- Teardown: the erasure deletes the bucket; a `finally` force-deletes it if the
  run ever leaked one. Verified 0 test buckets remain.

Replay: `GCP_TEST_PROJECT=ecode-proof-b906ss npx tsx services/api/scripts/physical-purge-gcs-e2e.ts --write`

## 2. Kubernetes — `k8s-proof.json` / `k8s-SHA256SUMS`

Runs against a throwaway **local `kind` cluster** — a real Kubernetes API server
and real PVC lifecycle at **$0**, chosen over GKE per the "stop if heavy/costly"
guardrail (a real k8s cluster, no cloud cost). Proves reserve #2 (verify the
**real** PVC disappearance, not the DB `DELETED` flag):

- BEFORE: a real **Bound** PVC (with a provisioned PV), mounted by a pod.
- ERASE: `kubectl delete pod + pvc` (the same primitives the workspace eraser
  uses via workspace-manager's k8s-client).
- AFTER (live `get pvc` → NotFound): `pvcCount=0`, `verified=true`.
- Teardown: `kind delete cluster` in an EXIT trap — the cluster and everything in
  it (incl. the PV) is destroyed.

Replay: `bash services/api/scripts/physical-purge-k8s-e2e.sh --write`

## Cost & teardown

| Resource | Where | Cost | Teardown |
| --- | --- | --- | --- |
| GCS bucket + 3 tiny objects | test project `ecode-proof-b906ss` | ~$0 (deleted in seconds) | erasure + `finally` force-delete; 0 left |
| kind cluster + 64Mi PVC | local Docker | $0 (no cloud) | `kind delete cluster` EXIT trap |

No GKE cluster was created (would have been the only "heavy/costly" option); a
local `kind` cluster satisfies "real k8s" at $0, so no cost sign-off was needed.
No persistent keys: GCS uses ADC (the reviewer's gcloud login), k8s uses the
local kind kubeconfig.

## Round 5 — CODEX-10: make the guarantee atomic with the topology read

CODEX-10 found the RR-09 guarantee was NOT atomic with the topology read: the
order was (1) `account-purge` lock, (2) `resolveStorageTopology`, (3) only THEN
the `system-setting:membership.purgeFrozenOrgIds` lock + freeze write. But
`addMember`/`removeMember` synchronise on the freeze-set lock, not `account-purge`
— so a join could take the freeze-set lock first, commit a new member, and the
purge's already-read topology was stale → the sole bucket was erased before the
drift check saw it. Fix in `acquirePurgeGuarantee`:

- **Take the `system-setting:membership.purgeFrozenOrgIds` lock BEFORE
  `resolveStorageTopology`**, and hold it to commit — so read + freeze are atomic
  w.r.t. membership. A join that grabbed the lock first commits before ours and is
  reflected in the topology (its now-shared org's bucket is excluded); one that
  arrives after blocks until our freeze is committed and is then refused.
- **Canonical lock order, documented and identical everywhere:**
  `account-purge:<userId>` < `system-setting:membership.purgeFrozenOrgIds` <
  `system-setting:objectStorage.purgeFrozenProjectIds`. `addMember`/`removeMember`
  take only the membership lock; release/reconcile take one lock per separate tx —
  none can invert the order, so no deadlock.

Proof (real Postgres, `account-purge-db.spec.ts` (11)): a **deterministic**
concurrent test where connection A grabs the membership freeze-set lock first,
the purge is confirmed BLOCKED on that lock via `pg_locks` (`NOT granted`) —
proving it takes the lock before reading topology — then A commits a join and
releases; the purge then sees the join, EXCLUDES the bucket from `eraseStorage`
(`bucketProjectIds` ∌ the project), the bucket survives, and no residual freeze
remains. Green 3/3 repeats.

## Round 4 — RR-09: guarantee BEFORE the irreversible deletion

RR-09 found the RR-08 drift guard fired too late — AFTER the irreversible GCS/PVC
deletion — so in the sole→shared case the bucket was already destroyed and the
guard only blocked the tombstone; and the object-storage freeze was never
released, leaving a residual freeze on abort. Reordered and hardened:

1. **Topology GUARANTEE acquired BEFORE any external deletion.**
   `acquirePurgeGuarantee(userId)` runs first, in ONE tx under the per-user
   advisory lock: it computes the authoritative sole/shared topology AND freezes
   it — membership for every org the subject belongs to, object storage for the
   sole-org buckets — atomically, then records a recoverable plan. The erasure
   then runs on THIS locked inventory, so it only ever deletes buckets that are
   sole under the guarantee.
2. **Membership mutations blocked during erasure.** `addMember` / `removeMember`
   take the freeze-set advisory lock and refuse (`MEMBERSHIP_FROZEN_FOR_PURGE`)
   for a frozen org, so no join/leave can flip sole↔shared mid-erasure.
3. **Delete only after the guarantee.** `deps.eraseStorage` is invoked only once
   a guarantee is held, on `guarantee.bucketProjectIds`.
4. **Recoverable freeze state machine, guaranteed release.**
   `releasePurgeGuarantee` runs in a `finally` on EVERY exit (purged / drift /
   throw) — unfreeze membership + object storage, clear the plan. A plan left by
   a crashed run is released by `reconcilePurgeFreezes()` at the start of the next
   purge-executor pass (surfaced as `reconciledFreezes`).
5. **sole→shared: the bucket is NEVER deleted** — a bucket shared under the
   guarantee is excluded from the erase inventory (a join before the guarantee),
   or the join is refused (a join during erasure).

Proof (real Postgres, `tests/account-purge-db.spec.ts`): (6) shared org's bucket
never handed to the erasure + survives; (7) co-member cannot leave while frozen;
(8) new member cannot join while frozen; (9) NO residual freeze after a failed
purge (guaranteed release on throw) + org writable again; (10) reconciler
releases a crashed run's freeze. The RR-08 drift check remains as a defence-in-
depth backstop for the razor-thin read→freeze window.

## Round 3 — RR-08: two blocking paths closed (fail-closed)

The reviewer (RR-08) found two more holes. Both are fixed fail-closed with
executable tests (real Postgres for the topology race; route + unit for the
write barrier). These paths are code/logic, not new external-I/O, so the proof
is the test suite below rather than a new GCS/kind artifact.

1. **Thumbnail (and every future signed upload) was outside the freeze barrier.**
   `POST /projects/:id/thumbnail/upload-url` called `ensureBucket` +
   `createUploadUrl` with NO freeze check, so it could recreate a bucket/object
   for a project the purge had already zero-checked. Fixed two ways:
   - the route now calls the same `objectStorageWriteBlocked` guard (early 403);
   - **structural** — `resolveObjectStorage()` now returns a
     `guardObjectStorageWrites()` wrapper whose CREATE/MODIFY primitives
     (`ensureBucket` / `createUploadUrl` / `putObject` / `moveObject`) refuse a
     frozen project, so the background thumbnail *capturer* and any future write
     path are covered by construction. The purge's OWN erasure uses the RAW
     (unwrapped) adapter, so it can still delete the very project it froze.
     Proof: `tests/object-storage-purge-freeze.spec.ts` (thumbnail → 403,
     generic upload-url → 403, reads still 200, unfreeze → 200) +
     `object-storage.spec.ts` `guardObjectStorageWrites` unit (every write
     refused, reads/deletes pass, unfrozen project writes).

2. **Topology was not serialized against the tombstone.** The external GCS/PVC
   erasure ran on the PRE-transaction sole/shared classification; the tx then
   recomputed it independently, so a membership race (shared→sole / sole→shared)
   during the erasure could strand a newly-sole org's bucket or destroy a
   newly-shared org's bucket, yet still stamp `purgedAt`. Fixed: the purge tx now
   re-derives the EXACT topology fingerprint under the advisory lock and
   **aborts (`ACCOUNT_PURGE_TOPOLOGY_DRIFT`) before any delete or the tombstone**
   on any drift — the account stays queued and the next run recomputes a fresh
   inventory (idempotent erasure). Never finalize on a stale inventory.
   Proof (real Postgres): `tests/account-purge-db.spec.ts` (6) shared→sole and
   (7) sole→shared — the `eraseStorage` hook IS the race window, so the tests
   mutate membership inside it and assert the purge aborts with no tombstone and
   intact storage rows.

## Round 2 — the six required corrections (fail-closed) + negatives

Each is implemented fail-closed and has an executable negative proving it:

1. **k8s barrier fails on ANY delete failure** — `manager.freezeWorkspace` now
   attempts every revoke (`allSettled`) but **throws** if any rejected and never
   marks the row stopped; the barrier is never reported acquired with a live
   write path. Negative: `manager.spec.ts` "reserve #1" (a failing Pod delete →
   throws, row not STOPPED).
2. **Real GCS backend required** — `eraseSubjectStorage` refuses (unverified,
   never calls delete) when there are buckets but no `active` backend; a
   `NoopObjectStorage` can never certify "absent". Negatives:
   `account-storage-purge.spec.ts` "reserve #2" and the **real GCS E2E**
   (`negative.inertBackendRefusedAndBucketSurvived: true` — the bucket survives).
3. **Block ALL object-storage write paths during purge** — the write barrier
   marks the subject's projects purge-frozen; `upload-url` / `ensure-bucket` /
   `move` return `403 OBJECT_STORAGE_PURGE_FROZEN`, so nothing is recreated after
   the zero-check.
4. **Inventory by REAL authorization** — workspaces are enumerated for EVERY
   project in ANY org the subject belongs to (shared orgs included, **without**
   needing a `ProjectCollaborator` row), plus explicit collaborations.
5. **Only an authenticated NotFound = absence** — `manager.pvcExists` does NOT
   catch `k8s.get`; the k8s-client returns undefined only for a real NotFound and
   re-throws network/RBAC errors, so a read error propagates (→ fail-closed),
   never "PVC absent". Negatives: `manager.spec.ts` "reserve #5", and the **kind
   E2E** (`negative.survivingPvcReportedPresent: true` — a live PVC is reported
   present, never mis-read as gone).
6. **E2E negatives** — both real E2Es carry a negative (above); the #1/#5
   error-handling negatives are proven deterministically in `manager.spec.ts`
   because a k8s network/RBAC/partial-delete error cannot be reliably injected
   through `kubectl` against `kind`.

## The four reserves (code)

- **#1 write barrier** — `eraseSubjectStorage` calls `WriteBarrierPort.freeze`
  BEFORE any delete; a freeze failure aborts erasure (nothing deleted, not
  verified). Prod path: workspace-manager `POST /workspaces/:id/freeze` (revoke
  token + stop pod).
- **#2 real disappearance** — verification re-checks the LIVE backend (GCS list /
  `GET /workspaces/:id/pvc-exists` → real `get pvc`), never a DB flag.
- **#3 by data subject** — the inventory erases the subject's sole-org buckets
  AND their per-user workspace in EVERY project they touched (sole-org +
  collaborator), not just one main `workspaceId`.
- **#4 real proof** — the two artifacts above.
