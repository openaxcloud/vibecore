# Data Retention

## Default Retention

- Audit logs: retained according to organization plan and compliance settings.
- Admin audit logs: retained for platform compliance and incident response.
- Project snapshots and exports: retained according to quota and project settings.
- Abuse events: retained for security investigation.
- Support tickets: retained according to support and legal policies.

## Deletion

- Project soft delete keeps recovery available until the configured retention window expires.
- Restore is blocked after permanent deletion.
- Runtime secrets are not included in snapshots or exports.

### Account-purge physical integrity

The durable `PurgePlan` inventory captured before relational cascades is the
authority for physical deletion. In addition to provider buckets and workspace
volumes, the proof records and verifies five API-local classes:

- sole-owner project trees;
- local export archives under `_objects/exports/<projectId>`;
- local checkpoint archives under `_objects/snapshots/<projectId>`, including
  every exact `ProjectSnapshot.storageKey` captured in the plan;
- the subject's `.vibecore-workspaces/<workspaceId>` tree in retained projects;
- static deployment snapshots referenced by live `Deployment` rows or
  append-only `ReleaseManifest` rows.

Sole-owned projects are not relationally cascaded by the account-purge
finalizer. Each one is erased through the canonical permanent-project deletion
saga, including its provider-specific subproofs, and produces an immutable
`ProjectPermanentDeletionReceipt`. The account receipt commits only after it
has independently matched every child receipt to the frozen project ID,
organization, ownership epoch, idempotency key, request hash, and absent Project
row. This preserves the physical authorities until their providers are proven
absent and prevents a database-only purge from being presented as erasure.
An active retained-source `RemixStorageShare` is a deliberate preflight block:
the operator or user must revoke or detach it before purge starts. The refusal
is committed before billing cancellation or any provider effect, so a
cross-tenant retention promise cannot turn into a permanently half-purged
account.

Each path is removed while the durable purge-effect lease and the same
cross-replica filesystem lock used by its writers are held. A successful effect
receipt is not sufficient evidence on replay: the path is checked live again,
and any residual or resurrected path leaves `remainingAfterPurge` non-zero and
prevents a terminal purge receipt.

While a purge plan is non-completed, all local/static writers for each captured
sole-owner project remain fenced even after transient workspace barriers are
released. In a retained shared project, that non-completed fence applies only
to the purged subject's checkout. Terminal completion releases these mutation
fences after verified erasure. Session creation and token lookup share
the per-user purge advisory lock and reject a target or impersonator with a
plan, purge receipt, or `purgedAt` marker. Custom `ProjectStorage` adapters are
therefore a test-only seam; production refuses them because their internal
check-to-write critical section cannot be proven to share the purge lock.

The non-completed purge plan temporarily retains the project name needed for
exact confirmation and crash recovery. The COMPLETED transition replaces that
inventory with receipt identifiers/hashes and stores only a one-way topology
commitment; the plaintext project name is not retained in completed purge
history.

## Legal Hold

Legal hold settings prevent automated deletion for covered organizations, projects, and audit records.

## Production Jobs

Production deployments must run scheduled retention jobs that:

- purge expired soft-deleted projects
- remove expired snapshots and exports
- preserve legal-hold records
- write audit records for destructive retention actions
- redact deleted personal data where required
