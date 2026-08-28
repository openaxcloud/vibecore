# Project volume permanent-erasure runbook

This primitive permanently erases project-owned Kubernetes storage from PVC to
PV to CSI provider. It is a typed sub-saga of the canonical
`PROJECT_PERMANENT_DELETE` operation and is shared by project hard-delete,
account purge and project-owned CNPG cleanup. Ordinary workspace stop/delete
keeps its existing lifecycle semantics and must never use this primitive. The
manager requires the API's durable `ObjectStorageOperation` lease, an explicit
creation-quiescence authority and the operation-scoped `ProjectVolumeErasure`
ledger before it can issue a delete.

Implementation:

- `services/workspace-manager/src/project-volume-erasure.ts` — inventory,
  ownership/refcount checks, replayable state machine and verification evidence.
- `services/workspace-manager/src/project-volume-erasure-adapters.ts` — direct
  in-cluster Kubernetes API adapter and real Compute Engine PD REST adapter using
  ADC/Workload Identity.
- `packages/database/prisma/migrations/0104_project_volume_erasure_ledger` —
  immutable source/inventory, per-PVC replay progress and fenced evidence.
- `packages/database/prisma/migrations/0105_project_volume_quiescence_and_csi_evidence`
  — durable Bound PVC→PV→CSI/provider producer evidence, immutable quiescence
  snapshot and fenced final live scan.
- `services/api/src/project-volume-erasure-coordinator.ts` — transport-free,
  single-batch replay seam and typed `project-volume-erasure-receipt-v1`.

## Durable orchestration contract

The owning control plane must use this order:

1. Every CSI producer (workspace and the shared CNPG create/restore/clone seam)
   first persists a `ProjectRuntimeEffect`, commits `IN_FLIGHT`, then performs
   provider/Kubernetes I/O outside a Prisma transaction. The effect becomes
   `SETTLED` only after immutable evidence contains the exact Bound PVC UID and
   resourceVersion, PV UID and resourceVersion, CSI driver/handle and provider
   resource ID. A returned error, accepted-provider timeout, Pending/unbound PVC
   or incomplete observation leaves the effect `IN_FLIGHT`; it is never inferred
   successful from a deterministic name.
2. In a short transaction, acquire the project-erasure lease/fencing token and
   freeze every workspace, Reserved VM, CNPG restore/import and CSI provisioning
   path. The global lock order is operation row → Project row → sorted runtime
   effect/target rows. Creation and erasure also serialize on the same
   `project-physical-mutation:<projectId>` PostgreSQL session advisory lock.
3. Still in short transactions, drain all settled CSI producer effects and seal
   a canonical quiescence snapshot containing every non-aborted PVC target and
   its immutable evidence hash. Quiescence is valid only while the Project is
   permanently frozen, every target remains `DRAINING`/`DRAINED` at the same
   ownership epoch, and the recomputed snapshot hash equals the sealed hash.
   Missing historical evidence or an `IN_FLIGHT` producer is
   `WORKSPACE_PROJECT_VOLUME_QUIESCENCE_UNAVAILABLE`; no provider effect follows.
4. Persist the exact candidate names/observed PVC UIDs from every durable ledger
   source, then union every live PV carrying the project/organization labels or
   a known claimRef. This includes PVs whose PVC and original application row are
   already absent. Conflicting/incomplete tenant labels and an orphan PV without
   exact historical PVC UID, PV UID, CSI handle/driver and provider resource ID
   fail closed instead of producing an empty inventory.
5. Call `captureProjectVolumeErasureInventory` outside a database transaction.
   It reads candidate PVCs, the complete cluster PV listing, StorageClasses and
   exact provider disk identities. Pending/unbound PVCs block the operation. It
   rejects tenant/UID/claimRef/StorageClass conflicts and shared references. No
   token, annotation, arbitrary label or credential enters the sealed inventory.
6. In a second short transaction, compare the same lease/fencing token and
   persist the complete inventory JSON plus `inventoryHash`. Commit before any
   delete request.
7. Call `executeProjectVolumeErasureEntry` outside the transaction, one sealed
   PVC entry per manager request. Its mandatory
   `leaseGuard.assertLease()` and `assertCreationQuiescence()` revalidate the
   durable operation token and quiescence hash immediately before every
   Kubernetes/provider request. A lease local only to this worker is
   insufficient.
8. Persist each entry's evidence with the current operation fencing token. A
   timeout/crash replays the same inventory entry verify-first; evidence from an
   older reclaimed token is re-established. Seal the root evidence only after
   every entry is absent under the current token.
9. Immediately before proof/finalization, perform a new complete live scan: list
   every PV again, re-read every candidate PVC, re-inspect every historical CSI
   handle/provider resource ID, and reject any recreated A→B identity. Pagination
   continues until the Kubernetes continuation token is empty; repeated tokens
   fail closed. There is no fixed ten-page/5,000-PV cap. Persist the scan evidence
   and hash under the current fencing token.
10. The API finalizer locks and verifies the ledger, producer evidence,
    quiescence and final scan against the `project-permanent-erasure-v3` workspace
    proof in the same transaction that deletes Project/runtime rows and writes
    the permanent receipt. The volume ledger remains attached to the committed
    operation after the Project cascade.

Never reconstruct an inventory after a partial delete. Replay the originally
persisted inventory and add only the mandatory final live scan: same-name PVC/PV
replacements and same-handle provider disk replacements then fail closed instead
of being mistaken for old resources. Each coordinator call advances at most one
persisted batch so API timeout/retry cannot turn a 5,000+ volume operation into
untracked in-memory work.

Example composition (after the durable lease and source snapshot exist):

```ts
const kubernetes = new InClusterProjectVolumeKubernetesAdapter();
const providers = new StaticProjectVolumeProviderResolver([
  new GcePersistentDiskProviderAdapter(), // ADC / GKE Workload Identity
]);
const creationQuiescence = {
  quiescenceHash: persistedPlan.quiescenceHash,
  assertCreationQuiescence: () => store.assertProjectVolumeCreationQuiescence(lease, persistedPlan.quiescenceHash),
};

const inventory = await captureProjectVolumeErasureInventory({
  scope: { organizationId, projectId },
  sourceSnapshot,
  kubernetes,
  providers,
  leaseGuard,
});

// Persist inventory + inventory.inventoryHash, and COMMIT here.

const evidence = await executeProjectVolumeErasure({
  expectedScope: { organizationId, projectId },
  inventory,
  kubernetes,
  providers,
  leaseGuard,
  creationQuiescence,
});
```

Here `leaseGuard` is the same object for capture and execution; its
`assertLease` implementation calls
`store.assertProjectErasureLease(projectId, operationId, fencingToken)`.
`creationQuiescence` is deliberately separate and is revalidated against the
durable runtime-effect ledger, not against process memory.

There must be no Prisma transaction callback around either service call.

## Deletion and replay semantics

- Every PVC/PV DELETE uses an API `DeleteOptions` body with UID and
  `resourceVersion` preconditions, zero grace and `Foreground` propagation.
  Plain `kubectl delete` is not suitable because its documented command path
  does not perform resource-version checks.
- `Delete` PVs: delete the PVC, begin foreground PV deletion, erase/verify the
  exact provider disk, then wait for the PV to disappear.
- `Retain` PVs: delete the PVC, explicitly erase/verify the provider disk, then
  delete and verify the PV. `Retain` must not preserve project data during an
  approved permanent erasure.
- If the PVC is already absent, inventory scans every PV `claimRef`. Deletion is
  authorized only when durable evidence exactly matches the `claimRef.uid`, PV
  UID, CSI driver/handle and provider resource ID. A name-only match, missing
  historical provider ID or ambiguous identity is
  `VOLUME_ERASURE_ORPHAN_PROVIDER_IDENTITY_UNPROVEN` and performs no provider
  effect.
- Known shared references, duplicate live CSI handles and explicit shared
  storage markers are excluded. The executor re-lists live PV handles under the
  lease before deletion to close the capture/execution race.
- Arbitrary finalizers are never stripped. A bounded PVC/PV absence timeout is a
  failed erasure that needs operator remediation, not proof of deletion.
- Provider DELETE retries use a stable request UUID. The GCE REST API has no
  disk-ID conditional-delete/CAS parameter: this primitive must not be described
  as an atomically exact REST delete. Safety depends on the durable creation
  quiescence authority, an immediate `disks.get` whose numeric resource ID still
  equals the sealed ID, a second quiescence check, then DELETE and an exact
  post-delete absence proof. An A→B resource-ID change is rejected before
  DELETE. If the quiescence authority cannot be revalidated, the adapter returns
  `CAPABILITY_UNAVAILABLE` before any effect.
- Compute Engine disk deletion does not delete snapshots. Any snapshot feature
  must supply and verify a separate snapshot-erasure inventory before the parent
  project-erasure workflow can claim total storage erasure.

### Threat boundary

The creation-quiescence proof covers every Vibecore CSI producer that is obliged
to use the durable runtime-effect seam. It does **not** claim to fence a
privileged GCP administrator who can bypass the control plane and create/delete
disks directly. Such administrators are the only excluded actor. Ordinary API,
workspace-manager, CNPG controllers and tenant workloads remain inside the
boundary; a producer that cannot join the ledger makes the capability
unavailable rather than widening the exception.

## Shared callers and receipt

- Hard-delete, account purge and CNPG all replay the same deterministic
  `PROJECT_PERMANENT_DELETE` operation. Account purge uses
  `account-purge:<planId>:<projectId>` and never creates a second PVC-only
  ledger or `deleteMany` path.
- `advanceProjectVolumeErasureSaga` advances one persisted batch and returns
  either replay progress or `project-volume-erasure-receipt-v1`. The receipt is
  scoped to `operationId`, `projectId`, `organizationId` and carries inventory,
  verification, final-scan and quiescence hashes plus exact erased/already-absent
  counts and all three absence booleans.
- CNPG must capture each exact project-owned candidate
  `{namespace,pvcName,pvcUid,pvcResourceVersion,projectId,organizationId,clusterName}`
  before deleting its Cluster. It must not directly delete CNPG PVCs. Shared
  clusters and non-project-owned candidates are excluded before they reach the
  volume seam. Create/restore/clone calls
  `executeProjectCsiProvisionEffect`; deletion never calls a producer seam.

## Fail-closed and manual cases

The operation remains replayable/manual and must not finalize when any of these
conditions is present:

- a PVC producer is `PREPARED`/`IN_FLIGHT`, or a settled historical PVC target
  lacks immutable Bound CSI/provider evidence;
- a candidate PVC is Pending/unbound, or its PVC/PV/claimRef/tenant labels drift;
- a labelled/known-claimRef orphan PV lacks exact historical PVC, PV, CSI or
  provider identity;
- a shared marker, duplicate CSI handle, conflicting tenant label or unknown CSI
  driver prevents exclusive attribution;
- the Kubernetes list returns a repeated continuation token, any page fails, or
  the mandatory final scan observes a recreated PVC/PV/provider resource;
- the GCE project allowlist, ADC identity, creation-quiescence authority,
  Kubernetes RBAC or provider identity re-GET is unavailable;
- a PVC/PV finalizer or provider operation exceeds its bounded poll timeout.

Operators repair the controller/provider condition and replay the same operation
ID. They never edit the sealed inventory/evidence JSON, fabricate provider IDs,
strip finalizers or convert these states into an empty proof.

## Kubernetes RBAC

Keep the existing namespaced Role for PVC `get` and `delete`. Add a dedicated,
feature-gated ClusterRole for the erasure worker; do not broaden the general
runtime Role:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: workspace-manager-project-volume-erasure
rules:
  - apiGroups: ['']
    resources: ['persistentvolumes']
    verbs: ['get', 'list', 'delete']
  - apiGroups: ['storage.k8s.io']
    resources: ['storageclasses']
    verbs: ['get']
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: workspace-manager-project-volume-erasure
subjects:
  - kind: ServiceAccount
    name: workspace-manager
    namespace: vibecore
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: workspace-manager-project-volume-erasure
```

The exact Helm service-account name and platform namespace must come from
`workspaceManager.serviceAccountName` and `platformNamespace`. No PV watch,
create/update/patch, Secret access or wildcard verb is required.

The same service account also needs a namespaced Role in `project-databases`
with only `get`, `list` and `delete` on PVCs. CNPG retains PVC create/update
authority; the manager receives no such verbs. Production currently keeps this
Role out-of-band unless `database.rbacManaged.enabled=true`, so the live Role
must be updated before enabling the CNPG volume seam.

## Google Cloud IAM

Bind the Kubernetes service account to a dedicated Google service account with
GKE Workload Identity. Grant only these permissions on the disk-hosting project:

- `compute.disks.get`
- `compute.disks.delete`

The regional-disk REST methods require the same `compute.disks.get/delete`
permissions; `compute.regionDisks.*` are not IAM permission names.

Use a custom role rather than a project-wide editor role. The adapter uses only
`compute.googleapis.com`, rejects non-canonical zonal/regional CSI handles, never
serializes the ADC token, and polls `disks.get` for live absence instead of
trusting an asynchronous operation response. IAM permission is necessary but is
not the creation-quiescence authority: the adapter still refuses DELETE when the
durable producer ledger cannot prove the project drained.

Production wiring uses the dedicated
`vibecore-prod-vol-erase@vibecore-495216.iam.gserviceaccount.com` identity,
bound only to KSA
`vibecore/vibecore-vibecore-platform-workspace-manager`. The adapter also
rejects handles outside `PROJECT_VOLUME_ERASURE_GCP_PROJECTS`. NetworkPolicy
opens metadata ports 80/988 only for the workspace-manager pod; Google API
traffic remains on the existing outbound 443 rule.

## Operator checks

Before enabling project permanent deletion, verify:

1. migrations `0104_project_volume_erasure_ledger` and
   `0105_project_volume_quiescence_and_csi_evidence` are applied;
2. `kubectl auth can-i --as=system:serviceaccount:vibecore:vibecore-vibecore-platform-workspace-manager list persistentvolumes` is yes, while create/patch is no;
3. the workspace-manager KSA annotation names the dedicated volume-erasure GSA;
4. the custom role contains exactly `compute.disks.get` and
   `compute.disks.delete` (these cover zonal and regional disks);
5. `PROJECT_VOLUME_ERASURE_GCP_PROJECTS` contains every allowed disk-hosting project and no wildcard.
6. the `project-databases` Role permits PVC `get/list/delete` but not
   `create/update/patch`, and every CNPG producer uses the runtime-effect seam.

Do not manually remove PV/PVC finalizers. A timeout is recoverable by replaying
the same permanent-delete idempotency key after fixing the controller/provider
condition. If identity cannot be proven, keep the operation uncommitted and
escalate with the operation ID, inventory hash and Kubernetes UIDs; never edit
the sealed JSON ledger.

References:

- [Kubernetes DeleteOptions API](https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.34/#deleteoptions-v1-meta)
- [kubectl delete reference](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_delete/)
- [GKE Persistent Disk CSI volume identity](https://cloud.google.com/kubernetes-engine/docs/concepts/persistent-volumes)
- [Compute Engine disks.delete](https://cloud.google.com/compute/docs/reference/rest/v1/disks/delete)
