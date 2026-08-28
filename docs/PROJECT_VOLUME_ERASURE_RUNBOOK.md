# Project volume permanent-erasure runbook

This primitive permanently erases project-owned Kubernetes storage from PVC to
PV to CSI provider. It is wired only into the project `permanent-delete` saga;
ordinary workspace stop/delete keeps its existing lifecycle semantics. The
manager requires the API's durable `ObjectStorageOperation` lease and the
operation-scoped `ProjectVolumeErasure` ledger before it can issue a delete.

Implementation:

- `services/workspace-manager/src/project-volume-erasure.ts` — inventory,
  ownership/refcount checks, replayable state machine and verification evidence.
- `services/workspace-manager/src/project-volume-erasure-adapters.ts` — direct
  in-cluster Kubernetes API adapter and real Compute Engine PD REST adapter using
  ADC/Workload Identity.
- `packages/database/prisma/migrations/0104_project_volume_erasure_ledger` —
  immutable source/inventory, per-PVC replay progress and fenced evidence.

## Durable orchestration contract

The owning control plane must use this order:

1. In a short database transaction, acquire a project-erasure lease/fencing
   token and make every workspace, Reserved VM, restore, import and provisioning
   path reject new storage references for that project. Commit the transaction.
2. Under the short operation → Project lock order, persist the exact candidate
   names/observed PVC UIDs and query all WorkspaceRuntime, Project,
   Deployment/Reserved VM and active runtime-effect references, including other
   tenants. The per-name advisory lock serializes this plan against new PVC
   runtime-effect targets. Commit before Kubernetes/provider I/O.
3. Call `captureProjectVolumeErasureInventory`. It reads PVCs, all PVs,
   StorageClasses and exact provider disk identities. It rejects tenant/UID/
   claimRef/StorageClass conflicts and records shared exclusions. No token,
   annotation, arbitrary label or credential enters the sealed inventory.
4. In a second short transaction, compare the same lease/fencing token and
   persist the complete inventory JSON plus `inventoryHash`. Commit before any
   delete request.
5. Call `executeProjectVolumeErasureEntry` outside the transaction, one sealed
   PVC entry per manager request. Its mandatory
   `leaseGuard.assertLease()` must compare the durable token immediately before
   every Kubernetes/provider request. All storage creation paths must honor the
   same fence; a lease local only to this worker is insufficient.
6. Persist each entry's evidence with the current operation fencing token. A
   timeout/crash replays the same inventory entry verify-first; evidence from an
   older reclaimed token is re-established. Seal the root evidence only after
   every entry is absent under the current token. Permanent deletion rejects
   shared exclusions rather than claiming that bytes were erased.
7. The API finalizer locks and verifies the ledger against the v3 workspace
   proof in the same transaction that deletes Project/runtime rows and writes
   the permanent receipt. The ledger remains attached to the committed
   operation after the Project cascade.

Never reconstruct an inventory after a partial delete. Replay the originally
persisted inventory: same-name PVC/PV replacements and same-handle provider disk
replacements then fail closed instead of being mistaken for old resources.

Example composition (after the durable lease and source snapshot exist):

```ts
const kubernetes = new InClusterProjectVolumeKubernetesAdapter();
const providers = new StaticProjectVolumeProviderResolver([
  new GcePersistentDiskProviderAdapter(), // ADC / GKE Workload Identity
]);

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
});
```

Here `leaseGuard` is the same object for capture and execution; its
`assertLease` implementation calls
`store.assertProjectErasureLease(projectId, operationId, fencingToken)`.

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
  authorized only when one durable expected PVC UID exactly matches the
  `claimRef.uid`; missing/ambiguous identity is
  `VOLUME_ERASURE_ORPHAN_IDENTITY_UNPROVEN` and performs no provider effect.
- Known shared references, duplicate live CSI handles and explicit shared
  storage markers are excluded. The executor re-lists live PV handles under the
  lease before deletion to close the capture/execution race.
- Arbitrary finalizers are never stripped. A bounded PVC/PV absence timeout is a
  failed erasure that needs operator remediation, not proof of deletion.
- Provider DELETE retries use a stable request UUID. GCE has no disk-ID
  conditional-delete parameter, so safety depends on the exclusive durable
  creation fence plus an exact disk-ID read immediately before DELETE and an
  exact post-delete absence proof.
- Compute Engine disk deletion does not delete snapshots. Any snapshot feature
  must supply and verify a separate snapshot-erasure inventory before the parent
  project-erasure workflow can claim total storage erasure.

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
trusting an asynchronous operation response.

Production wiring uses the dedicated
`vibecore-prod-vol-erase@vibecore-495216.iam.gserviceaccount.com` identity,
bound only to KSA
`vibecore/vibecore-vibecore-platform-workspace-manager`. The adapter also
rejects handles outside `PROJECT_VOLUME_ERASURE_GCP_PROJECTS`. NetworkPolicy
opens metadata ports 80/988 only for the workspace-manager pod; Google API
traffic remains on the existing outbound 443 rule.

## Operator checks

Before enabling project permanent deletion, verify:

1. migration `0104_project_volume_erasure_ledger` is applied;
2. `kubectl auth can-i --as=system:serviceaccount:vibecore:vibecore-vibecore-platform-workspace-manager list persistentvolumes` is yes, while create/patch is no;
3. the workspace-manager KSA annotation names the dedicated volume-erasure GSA;
4. the custom role contains exactly `compute.disks.get` and
   `compute.disks.delete` (these cover zonal and regional disks);
5. `PROJECT_VOLUME_ERASURE_GCP_PROJECTS` contains every allowed disk-hosting project and no wildcard.

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
