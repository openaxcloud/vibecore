# Remaining Blockers

Date: 2026-05-04

This file lists blockers that remain after the strict repo-local audit. Items here are not optional for paid production launch.

## P0 Before Private Beta

1. **Remote Kubernetes runtime validation fails or is not proven.**
   - Current local result: `pnpm run runtime:validate:api-kubernetes` fails during preflight because `http://127.0.0.1:3010/health` is not reachable; workspace-manager is not running or not exposed to this workstation.
   - Latest local result: `pnpm run runtime:validate:remote-kubernetes` now fails with an actionable timeout while pulling the required local validation node image: `Unable to pull required Docker image "kindest/node:v1.34.0"` after 600000ms.
   - Repo fix applied: the API Kubernetes validator checks API/workspace-manager/kubectl readiness before creating test data and uses the returned runtime `session.id` for pod/service checks instead of the project id. The direct remote Kubernetes validator now runs explicit `kubectl`/`kind`/Docker preflight checks, pulls the required `kind` node image as a separate diagnosable step, and wraps long `kind`, Docker and `kubectl` operations with timeouts and contextual error output.
   - Required proof: workspace start, file operations, command streaming, terminal WebSocket, logs, preview, snapshot, stop/restart/delete in staging GKE.
   - Next action: inspect API/runtime-manager logs and fix the workspace start path, then run `Staging Runtime Validation`.

2. **Workspace isolation is not proven live.**
   - Source proof exists for gVisor, restricted pod security, Kyverno, NetworkPolicies, ResourceQuota and LimitRange.
   - Current local result: `pnpm run networkpolicies:validate:live` fails during preflight because `kubectl cluster-info` cannot reach a Kubernetes API server from the active kube context.
   - Repo fix applied: the validator now checks cluster reachability before creating/deleting the probe pod and accepts `NETWORKPOLICY_NAMESPACE`, `WORKSPACE_NAMESPACE`, or `WORKSPACE_RUNTIME_NAMESPACE`.
   - Required proof: gVisor admission enforcement, no privileged pods, no hostPath, no hostNetwork/hostPID/hostIPC, metadata/internal CIDR egress blocked.
   - Next action: configure staging kube context, install policies, set exact Cloud SQL/Redis CIDRs, run denied-traffic drill.

3. **Production configuration is incomplete.**
   - Current result: `pnpm run production:validate` fails on OAuth, OIDC, SAML, email, SIEM, production `DATABASE_URL`/`REDIS_URL`, Stripe secrets/catalog, runtime HTTPS URLs, monitoring/incident response and SOC2/rotation evidence.
   - Latest local confirmation: strict validation still fails for missing real provider credentials and production URLs; `pnpm run production:validate:self-test` passes.
   - Next action: populate real staging/prod secret sets and rerun validation.

4. **Stripe live test-mode flow is unverified.**
   - Required proof: checkout, portal, signature rejection, duplicate event idempotency, invoice paid/failed, payment failed, upgrade, downgrade, cancel, trial.
   - Next action: run Stripe CLI/test-mode drill against staging.

5. **Backup restore is not proven.**
   - Current proof: fixture checksum dry-run only.
   - Required proof: Cloud SQL point-in-time restore and project storage restore in staging with measured RTO/RPO.
   - Next action: execute restore drill and attach evidence.

6. **Load tests have not been executed.**
   - Scripts exist for API, workspace lifecycle, preview, AI simulated load and billing webhooks.
   - Required proof: staging k6 reports with p50/p95/p99, error rates, workspace success rate, DB/Redis/GKE/AI metrics and cost estimate.
   - Next action: run all five scenarios.

7. **Admin actions are not fully browser-audited.**
   - Static validation covers 21 platform admin mutations for re-authentication and AdminAuditLog.
   - API tests cover key paths, including re-authentication, MFA and AdminAuditLog for sensitive platform-admin changes; the admin console browser UI smoke passes.
   - A complete route/button dangerous-action browser audit is still missing.
   - Required proof: every dangerous admin mutation requires proper role, fresh re-auth/MFA where applicable, and writes AdminAuditLog.
   - Next action: add/run Playwright admin audit.

8. **Secret canary is not proven across all outputs.**
   - Unit/system log redaction tests exist.
   - Repo fix applied: shared security redaction now masks secret-shaped string values even when they appear under neutral keys such as `logs`, and AI tool output redaction uses the shared string redactor.
   - Latest local result: `pnpm exec vitest --run services/api/src/tests/security.spec.ts services/api/src/tests/canary-logs.spec.ts` passes with 19 tests.
   - Latest API route proof: `pnpm exec vitest --run services/api/src/tests/api.spec.ts` passes with 53 tests, including route-level verification that `/projects/:projectId/ai/tools/get_terminal_output` and `/projects/:projectId/ai/tools/run_command` redact canary/OpenAI/GitHub/Google-shaped secrets in both API responses and persisted `AiToolCall.output`.
   - Required proof: canary never appears in live Kubernetes runtime command output, admin views, deployment logs and audit export.
   - Next action: add browser/admin/export canary test and rerun against staging runtime.

## P0 Before Paid Users

1. Stripe test-mode proof complete and documented.
2. Backend quota enforcement measured under concurrent workspace/AI/billing pressure.
3. Billing dashboard reconciles with Stripe state.
4. Deployment providers enabled for launch have live sandbox deploy and rollback proof.
5. Legal review for ToS, Privacy, DPA, AUP and subprocessor list.
6. Production monitoring, alerting, incident webhook and on-call routing live.
7. Rollback exercised in staging.

## P0 Before 1,000 Users

1. Workspace node-pool scaling and PVC provisioning latency measured.
2. Terminal concurrency and preview throughput measured.
3. Cloud SQL and Redis latency/connection pool metrics measured under load.
4. AI provider throttling/fallback strategy tested.
5. Abuse detection drills executed and SIEM delivery observed.
6. Support and incident response process staffed and rehearsed.

## P0 Before 10,000 Users

1. Multi-region or single-region DR decision documented and validated.
2. GKE, Cloud SQL and Redis sizing based on measured data.
3. Queue depth and worker scaling tested.
4. Preview traffic and deployment cost model validated.
5. AI provider quota/rate/cost model validated.
6. Disaster recovery tabletop and restore drill repeated at scale.

## P1 Before Mobile Or Desktop Beta Scope

1. iOS signed IPA/TestFlight proof.
2. Android signed AAB/Play internal track proof.
3. APNs and FCM proof.
4. App links and associated domains published with production hosts.
   - Current result: `pnpm run mobile:validate` passes, but `pnpm run mobile:validate:release` fails because the configured Android app link host is still `app.example.com`.
   - Current result: `pnpm run mobile:release-assets:check` also fails because `MOBILE_APP_LINK_HOST` is not configured.
   - Tooling proof: `MOBILE_APP_LINK_HOST=app.vibecore.ai MOBILE_IOS_APP_IDS=ABCDE12345.app.vibecore.mobile MOBILE_ANDROID_PACKAGE_NAME=app.vibecore.mobile MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS=AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99 pnpm run mobile:release-assets:check` passes in dry-run, proving the generator works when release metadata is supplied.
5. Real-device phone/tablet editor QA.
6. macOS/Windows/Linux signed desktop release artifacts.
7. Desktop auto-updater drill.
