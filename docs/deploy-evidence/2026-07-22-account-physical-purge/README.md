# Account purge — physical erasure proof (§16.12)

Closes the physical-erasure gap left by the DB-only account-purge worker (PR #43):
a purged account's **out-of-database** storage — per-project GCS object-storage
buckets (`vc-<projectId>`) and workspace volumes (PVCs) — is now really erased,
with an auditable "0 remaining" proof, and the purge **fails closed** (never
stamps `purged`) unless that proof holds.

## What this artifact is

`proof.json` is a real `ErasureProof` produced by running the actual
`eraseProjectsStorage` orchestration (`services/api/src/account-storage-purge.ts`)
against a **throwaway test bucket + workspace volume** — never production user
data. It records, per physical data class:

- `object_storage` — buckets deleted + objects erased (listed **before**), and
  `remainingAfterPurge` re-counted **after** the delete (must be `0`);
- `workspace_volumes` — workspaces (Pod+PVC+Service+Secret) deleted, re-checked
  gone (`remainingAfterPurge` must be `0`).

`verifiedZeroRemaining: true` is only possible when every class re-counted to 0.
`SHA256SUMS` is the SHA-256 of the canonical (key-sorted) `proof.json`.

## Replay it

```bash
# regenerate + print PASS/FAIL and the hash
npx tsx services/api/scripts/physical-purge-proof.ts

# regenerate and (re)write proof.json + SHA256SUMS
npx tsx services/api/scripts/physical-purge-proof.ts --write
```

CI replays it on every run: `src/tests/physical-purge-proof.spec.ts` re-runs the
erasure and asserts this committed artifact is reproduced **byte-for-byte** (so
the hashed proof can never silently drift from the code).

The fixture erases two projects — one with 3 objects + a workspace, one with 2
objects and no workspace — so the proof exercises objects, buckets and volumes
together: 5 objects listed before → 0 after, 1 workspace before → 0 after.

## Live (production topology)

In production the same orchestration is driven by `POST /internal/account-purge`
with real adapters: `ObjectStorage.deleteBucket` (the API pod's Workload Identity
holds `roles/storage.admin`) and `DELETE /workspaces/:id` on workspace-manager
(which owns Kubernetes access and deletes the PVC). A live replay must target a
**test project**, never real user data.
