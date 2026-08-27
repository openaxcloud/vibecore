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

Each path is removed while the durable purge-effect lease and the same
cross-replica filesystem lock used by its writers are held. A successful effect
receipt is not sufficient evidence on replay: the path is checked live again,
and any residual or resurrected path leaves `remainingAfterPurge` non-zero and
prevents a terminal purge receipt.

Once a sole-owner project appears in a purge plan, all of its local/static
writers remain fenced by the durable plan even after transient workspace
barriers are released. In a retained shared project, the durable fence applies
only to the purged subject's checkout. Session creation and token lookup share
the per-user purge advisory lock and reject a target or impersonator with a
plan, purge receipt, or `purgedAt` marker. Custom `ProjectStorage` adapters are
therefore a test-only seam; production refuses them because their internal
check-to-write critical section cannot be proven to share the purge lock.

## Legal Hold

Legal hold settings prevent automated deletion for covered organizations, projects, and audit records.

## Production Jobs

Production deployments must run scheduled retention jobs that:

- purge expired soft-deleted projects
- remove expired snapshots and exports
- preserve legal-hold records
- write audit records for destructive retention actions
- redact deleted personal data where required
