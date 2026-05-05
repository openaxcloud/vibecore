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
