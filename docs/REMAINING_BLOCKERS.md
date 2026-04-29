# Remaining Blockers

Date: 2026-04-29

## P0 Blockers Before Any Paid Production Launch

1. Live Remote Kubernetes RuntimeAdapter validation is missing.
   - Required proof: workspace start, file operations, terminal WebSocket, logs, preview, stop/restart/delete in a real GKE staging cluster.

2. Workspace isolation is not proven live.
   - Required proof: `runtimeClassName: gvisor` enforced by admission policy, no privileged pods, no hostPath, no hostNetwork, default-deny NetworkPolicies, metadata/internal service egress blocked.

3. Stripe live test-mode webhook flow is not verified.
   - Required proof: signature verification, duplicate idempotency, checkout, portal, invoice events, payment failed, trial, cancellation, upgrade, downgrade, metered usage readiness.

4. Load tests have not been executed against staging.
   - Required proof: k6 reports for API, workspace lifecycle, preview, AI simulated load, and billing webhooks.

5. Backup restore has not been executed against real staging resources.
   - Required proof: Cloud SQL point-in-time restore, project snapshot restore, storage lifecycle check, documented RTO/RPO.

6. CI/CD workflows have not been proven in GitHub with real staging/prod environments.
   - Required proof: full workflow runs, artifact publishing, manual prod approval, rollback instructions attached to deployment.

7. Secrets redaction must be verified with canary secrets.
   - Required proof: canary secret never appears in API logs, runtime logs, deployment logs, AI tool output, admin views, or exported audit data.

## P0 Blockers Before 1,000 Users

1. Workspace capacity model must be validated.
   - Required proof: node pool scaling, workspace start success rate, PVC provisioning latency, terminal concurrency, preview throughput.

2. Database and Redis performance must be measured under realistic concurrency.
   - Required proof: DB latency, Redis latency, queue depth, error rates, connection pool utilization.

3. Observability must be live.
   - Required proof: metrics, traces, structured logs, dashboards, alerts, uptime checks, synthetic checks.

4. Abuse detection drills must be executed.
   - Required proof: crypto-mining command detection, fork bomb, suspicious egress, storage abuse, AI abuse, auth failure spike.

## P0 Blockers Before 10,000 Users

1. Multi-region or regional DR decision must be made and validated.
2. Cloud SQL/Redis/GKE sizing must be based on measured load.
3. Preview and deployment traffic cost model must be validated.
4. AI provider fallback and rate-limit strategy must be tested with provider throttling.
5. Support, incident response, and status page operations must be staffed and rehearsed.

## P1 Blockers Before Private Beta

1. Run Playwright staging E2E for auth, projects, IDE, terminal, preview, billing, admin.
2. Run real tablet/mobile editor fallback tests.
3. Validate OAuth Google/GitHub and at least one OIDC provider in staging.
4. Validate SMTP email verification and password reset delivery.
5. Validate admin dangerous action re-auth and AdminAuditLog rows.
6. Validate project import/export/snapshot/restore end-to-end.
7. Validate deployment provider selected for beta.
8. Validate legal/compliance pages with product/legal owner.
9. If iOS/Android are in any beta scope, define and implement native app release, signing, device QA, and store distribution requirements first.

## P2 Follow-Ups

1. Desktop release matrix before any desktop beta.
2. SAML/SCIM certification-style tests before Enterprise launch.
3. External penetration test before public launch.
4. SOC2 control owner assignment and evidence collection.
