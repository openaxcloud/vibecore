# Runbook

## API Errors

1. Open Grafana dashboard `VibeCore Platform SRE`.
2. Check `API error rate` and `API latency p50/p95/p99`.
3. Filter logs by `correlationId` or `requestId`.
4. Check recent deploys and database/Redis latency.
5. If 5xx errors are rising, rollback the API deployment or disable the affected feature flag.

## Workspace Start Failures

1. Check `workspace_failures_total` and `workspace_start_latency_seconds`.
2. Inspect workspace-manager logs.
3. Verify Kubernetes node pool capacity, RuntimeClass `gvisor`, PVC provisioning, and admission policy reports.
4. If sandbox capacity is exhausted, scale the sandbox node pool.
5. If PVC provisioning is failing, pause workspace creation and open an incident.

## Project Storage and Snapshots

1. Check `ProjectSnapshotRestoreFailures` and `project_snapshot_restore_failures_total`.
2. Inspect API logs for `snapshot.local_archive_unavailable`; this means the serving API pod could not read the pod-local archive cache.
3. Confirm the matching `ProjectStorageObject` row exists for the snapshot `storageKey` and that `contentHash` matches the SHA-256 of `contentBase64`.
4. If `project_snapshot_restore_fallbacks_total` rises but restores succeed, the durable DB archive fallback is working; investigate pod-local storage churn but do not block users.
5. If checksum mismatch or missing durable archive occurs, stop snapshot restore for the affected project, export current project files, and open an incident before deleting any project storage rows.

## AI Provider Degradation

1. Check provider health and `ai_provider_errors_total`.
2. Enable fallback routing in AI Gateway if primary provider is degraded.
3. Confirm token quotas and billing state are not blocking requests.
4. Communicate degradation on the status page if user-visible.

## Stripe Webhook Failures

1. Check `stripe_webhook_failures_total`.
2. Verify `STRIPE_WEBHOOK_SECRET` and endpoint configuration.
3. Replay failed Stripe events after fixing signature or endpoint issues.
4. Confirm idempotency records prevent duplicate subscription mutations.

## Abuse Event

1. Open admin abuse events.
2. Review linked org, user, workspace, command, and audit logs.
3. Keep workspace stopped for critical events.
4. Suspend org if repeated or severe.
5. Require manual review before reinstatement.

## Backup Restore Failure

1. Check `BackupRestoreDryRunFailed`.
2. Run `pnpm sre:validate` locally.
3. Verify Cloud SQL backup status, object storage lifecycle, and restore credentials.
4. Escalate to incident response if latest verified restore is older than the RPO.
