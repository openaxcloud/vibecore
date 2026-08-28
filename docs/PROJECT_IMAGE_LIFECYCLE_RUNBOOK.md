# Project image lifecycle and permanent erasure

Vibecore persists every per-app Cloud Build before the provider receives a
create request. A project hard-delete cannot remove the `Project` row until all
of its producers are terminal, every Artifact Registry package has been swept
from an immutable inventory, and PostgreSQL holds the matching verified
receipt.

## Durable states

`AppImageBuildOperation` is the source of truth for producer recovery:

1. `PREPARED` — immutable request hash and provider identity committed; no POST.
2. `SUBMITTING` — committed immediately before the Cloud Build POST. A retry
   lists by the stable `operationTag`; it never submits a second build.
3. `IDENTIFIED` — the provider build id is durable.
4. `TERMINAL` or `REJECTED` — fresh provider outcome persisted.
5. `CANCELLED` — hard-delete owns a fresh terminal/cancellation proof. A late
   `SUCCESS` is recorded as such and still requires the registry sweep.

`ProjectRegistryErasure` is tied to the permanent-delete operation and moves
only `PREPARED -> ERASING -> VERIFIED`. The exact package/version/tag inventory
is immutable. A crash in `ERASING` replays that inventory idempotently; it never
recaptures a smaller view. `VERIFIED` is accepted only when the compact receipt
matches the durable inventory hash and all receipt counts are internally exact.
The build row also commits `targetRepository` before promotion starts, so a
crash after a successful provider copy cannot hide the target package from the
later inventory even when no release manifest was committed.

## Ordering and fences

The production order is deliberately strict:

1. Freeze the project through the permanent-delete object-storage lease.
2. Recover/cancel every Cloud Build and wait for a fresh terminal GET.
3. Acquire sorted PostgreSQL session locks for every source and tenant package.
4. Capture and persist the exact Artifact Registry inventory.
5. Delete or retain each tag/manifest from fresh global reference counts, then
   verify the final provider view and persist the receipt.
6. Drain workspace/runtime effects, erase filesystem/static/GCS data, verify
   absence, then delete build rows and the `Project` in one final transaction.

Build, promotion, release re-promotion and erasure use the same
`artifact-registry-package:<repository>` session-lock namespace. Provider I/O
runs while a session lock is held but never inside a database transaction.

## IAM and Helm prerequisites

The API KSA must use the Terraform-managed platform Workload Identity; never
mount a service-account JSON key. When snapshot publication is enabled:

- the platform GSA needs `roles/cloudbuild.builds.editor` in the build project
  to create, list, inspect and cancel durable builds;
- it needs `roles/iam.serviceAccountUser` on the dedicated builder GSA;
- every source or tenant repository that can contain `p-<project>` packages
  must grant the platform GSA repository-scoped
  `roles/artifactregistry.repoAdmin`;
- the dedicated builder remains only `roles/artifactregistry.writer` on the
  source repository and reader on explicitly configured base-image repos.

Declare source and target grants in Terraform
`artifact_promotion_repositories`. The root and IAM-module checks refuse a
configured builder without source-repository erasure authority. Helm
`global.workloadIdentity.api` must remain the same platform GSA, and
`platformEnv.runtime.serverDeployImageRepo` must match the Terraform source
repository.

## Recovery and verification

Never edit a lifecycle row, manufacture a receipt, or manually delete the
PostgreSQL inventory. Retry the original hard-delete idempotency key. The saga
will reclaim an expired lease, reconcile `SUBMITTING` by its provider tag,
resume an `ERASING` registry inventory, and return the immutable deletion
receipt after commit.

Before rollout, apply migration
`0104_app_image_build_registry_erasure`, then verify:

```sql
SELECT "phase", count(*)
FROM "AppImageBuildOperation"
GROUP BY "phase"
ORDER BY "phase";

SELECT "state", count(*)
FROM "ProjectRegistryErasure"
GROUP BY "state"
ORDER BY "state";
```

An old `SUBMITTING` row, an `ERASING` row whose delete is not actively retrying,
or any receipt/inventory mismatch is an incident. Preserve the rows, provider
build id/tag and operation id; retry through the API so all fences and fresh
provider checks remain in force.

Required pre-production gates are the API typecheck/build/lint, the fresh
migration chain, `app-image-build.spec.ts`, `project-registry-erasure.spec.ts`,
`app-image-build-registry-store-db.spec.ts`, and the permanent-delete DB specs.
