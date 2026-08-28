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
   lists by the stable `operationTag`; it never submits a second build. The
   database also sets `submissionResolveAfter` from `clock_timestamp()`.
3. `MANUAL_RECOVERY` — the DB deadline elapsed and an operator attached an
   audited provider-query proof; hard-delete remains blocked.
4. `REJECTED_ABSENT` — at least two audited provider queries over the exact tag
   proved absence. Only this proof (or a definitive create rejection) may close
   a submission without a provider id.
5. `IDENTIFIED` — the provider build id is durable.
6. `TERMINAL` or `REJECTED` — fresh provider outcome persisted.
7. `CANCELLED` — hard-delete owns a fresh terminal/cancellation proof. A late
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

Build, trusted signing, promotion, release re-promotion and erasure use the
same `artifact-registry-package:<repository>` session-lock namespace and a
`RegistryMutationOperation` durable fence. Session loss aborts provider I/O and
leaves `AMBIGUOUS`; another operation on the package and hard-delete both fail
closed until an audited, exhaustive recovery proof resolves it. A known
provider operation without a durable receipt moves to `MANUAL_RECOVERY`; this
is an explicit safe blockade, never an impossible pseudo-resolution. Every
attempt has a durable `attemptNumber`, `attemptId` and fencing token. Only a
`FAILED_SAFE` project erasure may reopen the same deterministic id, and only
after its immutable inventory passes a read-only verify-first check under the
package locks. Provider I/O runs while the session lock is held but never
inside a database transaction.

Project package names are database-enforced as `p-<projectId>`. A source,
promotion or release row that points at another project's package is rejected;
GC never retains a cross-project last reference and silently leaks it.

## IAM and Helm prerequisites

The API KSA must use the Terraform-managed platform Workload Identity; never
mount a service-account JSON key. Snapshot publication is disabled in both the
production values and deploy workflow until provisioning plus the signed-image
canary are complete. When an audited activation change enables it:

- the platform GSA needs `roles/cloudbuild.builds.editor` in the build project
  to create, list, inspect and cancel durable builds;
- it needs `roles/iam.serviceAccountUser` on the dedicated builder GSA;
- it needs `roles/iam.serviceAccountUser` on the distinct trusted signer GSA;
- every source or tenant repository that can contain `p-<project>` packages
  must grant the platform GSA repository-scoped
  `roles/artifactregistry.repoAdmin`;
- the dedicated builder remains only `roles/artifactregistry.writer` on the
  source repository and reader on explicitly configured base-image repos; it
  has no KMS role and no tenant-target repository binding (the Terraform test
  treats either cross-tenant grant as a deployment failure);
- the trusted signer has source-repository writer plus KMS
  `signerVerifier`/viewer on the exact CryptoKey, and receives no user source;
- the exact Cloud Build service agent
  `service-<PROJECT_NUMBER>@gcp-sa-cloudbuild.iam.gserviceaccount.com` has
  `roles/iam.serviceAccountTokenCreator` on each of those two GSAs only.

The user-controlled Dockerfile RUN is JSON-encoded and always executed through
`docker build --network=none`. The source snapshot already contains dependency
trees; no platform credential, secretEnv, secret mount, volume, token or KMS
reference enters that build request. Signature, SBOM and attestation run later
in a no-source, platform-authored Cloud Build under the signer GSA.

Declare source and target grants in Terraform
`artifact_promotion_repositories`. The root and IAM-module checks refuse a
configured builder without source-repository erasure authority. Helm
`global.workloadIdentity.api` must remain the same platform GSA, and
`platformEnv.runtime.serverDeployImageRepo` must match the Terraform source
repository.

## Recovery and verification

Never edit a lifecycle row, manufacture a receipt, or manually delete the
PostgreSQL inventory. Retry the original hard-delete idempotency key. The saga
reconciles `SUBMITTING` by its provider tag, resumes a verified inventory, and
returns the immutable deletion receipt after commit. An empty list response
before the DB deadline proves nothing.

After the deadline, query Cloud Build at least twice at distinct timestamps,
inside the declared observation window, using the exact
`tags="<operationTag>"` filter, project and region. Record the operator identity
and audit-event id through the internal
`resolveAppImageBuildSubmission` coordinator. `REJECTED_ABSENT` is accepted
only when every recorded result is `ABSENT`. Resolve an `AMBIGUOUS` registry
mutation only through `POST /admin/registry-mutations/:operationId/recovery`.
The route requires a platform-admin session, MFA when deployment policy
requires it, and re-auth within 60 seconds. The store derives operation,
tenant, intent, attempt and operator identities; it creates the immutable
`AuditLog` and relational `RegistryMutationRecovery` row in the same
transaction. `VERIFIED` requires a matching stored provider receipt,
`FAILED_SAFE` requires exhaustive absence with no provider id/evidence, and
unresolved observations (including a known provider id without a receipt) must
use `MANUAL_RECOVERY`. Never paste or invent an audit id. Keep the incident
open while it is in manual recovery.

Example body (timestamps and observations must come from the provider query
record, not the API pod clock):

```json
{
  "resolution": "MANUAL_RECOVERY",
  "observationWindowStartedAt": "2026-08-28T10:00:00.000Z",
  "observationWindowEndedAt": "2026-08-28T10:05:00.000Z",
  "providerQueries": [
    {
      "queriedAt": "2026-08-28T10:01:00.000Z",
      "providerOperationId": "provider-operation-id",
      "result": "UNRESOLVED"
    },
    {
      "queriedAt": "2026-08-28T10:04:00.000Z",
      "providerOperationId": "provider-operation-id",
      "result": "UNRESOLVED"
    }
  ]
}
```

Account purge must not create a second image ledger. For every owned project it
creates/replays the existing `PROJECT_PERMANENT_DELETE` operation with key
`account-purge:<planId>:<projectId>`, calls
`captureCancelAndSweepProjectImages`, and consumes its typed Cloud Build +
Artifact Registry subreceipt. The permanent-delete finalizer binds that receipt
to the exact project/operation and recounts the locked producer inventory.
`assertAccountPurgeProjectChildrenComplete` blocks the relational account purge
while any child Project row remains; there is no `Project.deleteMany` bypass.
Direct `Project.delete` fails with `PROJECT_IMAGE_ERASURE_RECEIPT_REQUIRED`
while image lifecycle authority remains.

Before rollout, apply migrations in lexical order:
`0108_app_image_build_registry_erasure`,
`0109_registry_recovery_enum_values`,
`0110_registry_mutation_counteraudit`,
`0111_registry_mutation_manual_recovery_enum`, then
`0112_registry_mutation_recovery_attempts`. Both enum migrations are
deliberately committed separately because PostgreSQL cannot safely consume a
newly added enum value in the transaction that introduces it. Then verify:

```sql
SELECT "phase", count(*)
FROM "AppImageBuildOperation"
GROUP BY "phase"
ORDER BY "phase";

SELECT "state", count(*)
FROM "ProjectRegistryErasure"
GROUP BY "state"
ORDER BY "state";

SELECT "kind", "state", count(*)
FROM "RegistryMutationOperation"
GROUP BY "kind", "state"
ORDER BY "kind", "state";

SELECT recovery."operationId", recovery."attemptNumber", recovery."resolution",
       recovery."auditLogId", audit."actorUserId", audit."createdAt"
FROM "RegistryMutationRecovery" AS recovery
JOIN "AuditLog" AS audit ON audit."id" = recovery."auditLogId"
ORDER BY recovery."createdAt" DESC;
```

An old `SUBMITTING` row, an `ERASING` row whose delete is not actively retrying,
or any receipt/inventory mismatch is an incident. Preserve the rows, provider
build id/tag and operation id; retry through the API so all fences and fresh
provider checks remain in force.

Required pre-production gates are the API typecheck/build/lint, the fresh
migration chain, `app-image-build.spec.ts`, `project-registry-erasure.spec.ts`,
`app-image-build-registry-store-db.spec.ts`, and the permanent-delete DB specs.
