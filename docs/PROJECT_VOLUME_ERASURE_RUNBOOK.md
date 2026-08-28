# Project volume permanent-erasure runbook

This primitive permanently erases project-owned Kubernetes storage from PVC to
PV to CSI provider. It is intentionally not wired into the workspace manager's
ordinary `purgeWorkspace` path yet: a caller must first provide a durable,
exclusive erasure lease and a complete cross-tenant source-reference snapshot.

Implementation:

- `services/workspace-manager/src/project-volume-erasure.ts` — inventory,
  ownership/refcount checks, replayable state machine and verification evidence.
- `services/workspace-manager/src/project-volume-erasure-adapters.ts` — direct
  in-cluster Kubernetes API adapter and real Compute Engine PD REST adapter using
  ADC/Workload Identity.

## Durable orchestration contract

The owning control plane must use this order:

1. In a short database transaction, acquire a project-erasure lease/fencing
   token and make every workspace, Reserved VM, restore, import and provisioning
   path reject new storage references for that project. Commit the transaction.
2. Outside every database transaction, query all durable workspace-runtime and
   Reserved VM PVC references for the candidate claim names, including references
   belonging to other tenants. Mark the snapshot completeness as
   `all-active-references-for-candidate-claims`.
3. Call `captureProjectVolumeErasureInventory`. It reads PVCs, all PVs,
   StorageClasses and exact provider disk identities. It rejects tenant/UID/
   claimRef/StorageClass conflicts and records shared exclusions. No token,
   annotation, arbitrary label or credential enters the sealed inventory.
4. In a second short transaction, compare the same lease/fencing token and
   persist the complete inventory JSON plus `inventoryHash`. Commit before any
   delete request.
5. Call `executeProjectVolumeErasure` outside the transaction. Its mandatory
   `leaseGuard.assertLease()` must compare the durable token immediately before
   every Kubernetes/provider request. All storage creation paths must honor the
   same fence; a lease local only to this worker is insufficient.
6. Persist the returned compact evidence only after `verified: true`. The
   evidence proves live absence of the exact PVC UID, PV UID and provider disk
   ID, or records a deliberate shared-storage exclusion.

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

Use a custom role rather than a project-wide editor role. The adapter uses only
`compute.googleapis.com`, rejects non-canonical zonal/regional CSI handles, never
serializes the ADC token, and polls `disks.get` for live absence instead of
trusting an asynchronous operation response.

References:

- [Kubernetes DeleteOptions API](https://kubernetes.io/docs/reference/generated/kubernetes-api/v1.34/#deleteoptions-v1-meta)
- [kubectl delete reference](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_delete/)
- [GKE Persistent Disk CSI volume identity](https://cloud.google.com/kubernetes-engine/docs/concepts/persistent-volumes)
- [Compute Engine disks.delete](https://cloud.google.com/compute/docs/reference/rest/v1/disks/delete)
