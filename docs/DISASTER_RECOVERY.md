# Disaster Recovery

## Objectives

- API RTO: 1 hour
- API RPO: 15 minutes
- Project metadata RTO: 2 hours
- Project metadata RPO: 15 minutes
- Snapshot/object storage RTO: 4 hours
- Snapshot/object storage RPO: 1 hour

## Regional Failure

1. Declare SEV1.
2. Freeze destructive jobs.
3. Restore PostgreSQL from latest verified PITR point.
4. Restore object storage bucket or fail over to replicated bucket.
5. Recreate Kubernetes workspace runtime namespace, RuntimeClass, NetworkPolicies, ResourceQuota, LimitRange, and Kyverno policies.
6. Redeploy API, worker, workspace-manager, preview-proxy, AI gateway, and admin.
7. Run synthetic checks and critical user journey tests.
8. Update status page.

## Verification

Disaster recovery drills must verify:

- database restore
- project snapshot restore
- workspace start
- terminal connectivity
- preview availability
- AI chat/tool execution
- billing webhook acceptance

## Local database and object restore drill

On Linux with Node 24, run this command from the repository root. It creates a
private temporary directory, uses SQLite and local files, prints JSON on success,
and removes the directory on exit. No service configuration is required.

```sh
node scripts/recovery/local-drill.mts
```

The fixture has a single writer. The drill closes SQLite and pauses writes while
copying both the database and its objects. Traces 1 and 2 form the checkpoint.
Trace 3 is committed after the copy. Verification checks SQLite integrity, exact
rows and object names, and each object's SHA-256 against its database row.
A deliberately damaged copy must fail verification while the original stays active.

For cutover, verify the candidate against the checkpoint before atomically
renaming the active symlink over the previous pointer. Read back through that
pointer. For rollback, retain the original directory, switch the pointer back,
and read all three traces and their objects. The drill performs both switches
with writes paused and no open connections.

The JSON measures elapsed milliseconds for copy plus backup verification,
restore through verified cutover, and rollback through verified readback.
The last restored trace is 2. The local run does not measure Cloud SQL PITR,
GCS recovery, service restart, or production RPO/RTO. A recorded run is in
[the local drill evidence](reprise/mesures/local-db-object-drill.json).
