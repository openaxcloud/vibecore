# Remaining Blockers

Date: 2026-05-26

This file lists blockers that remain after the strict repo-local audit. Items here are not optional for paid production launch.

## P0 Before Private Beta

1. **Remote Kubernetes runtime E2E proof is still required after deploy.**
   - Current cluster configuration result: `pnpm run production:validate:live -- --no-dotenv`, populated only from the Kubernetes Secret/ConfigMap, now passes `Runtime mode`, including `VITE_RUNTIME_MODE=remote-kubernetes`, `VITE_RUNTIME_API_BASE_URL`, `WORKSPACE_MANAGER_URL`, workspace namespace, agent image, preview shared secret and preview URL template.
   - Current deployment result: production pods are healthy, but the live deployments still run image tag `sha-1116d9d`; the latest committed code is `1e578a1d` and is not deployed.
   - Required proof: workspace start, file operations, command streaming, terminal WebSocket, logs, preview, snapshot, stop/restart/delete in the live Kubernetes runtime after deploying the latest image.
   - Next action: unblock production validation, deploy the latest image set, then run the staging/production runtime validation and Playwright IDE preview checks against the deployed host.

2. **Workspace isolation is not proven live.**
   - Source proof exists for gVisor, restricted pod security, Kyverno, NetworkPolicies, ResourceQuota and LimitRange.
   - Current cluster access is available, but the denied-traffic drill has not been rerun in this review against the active production/staging workspace namespace.
   - Repo fix applied: the validator now checks cluster reachability before creating/deleting the probe pod and accepts `NETWORKPOLICY_NAMESPACE`, `WORKSPACE_NAMESPACE`, or `WORKSPACE_RUNTIME_NAMESPACE`.
   - Required proof: gVisor admission enforcement, no privileged pods, no hostPath, no hostNetwork/hostPID/hostIPC, metadata/internal CIDR egress blocked.
   - Next action: configure staging kube context, install policies, set exact Cloud SQL/Redis CIDRs, run denied-traffic drill.

3. **Production configuration is incomplete.**
   - Latest cluster-only result: `VALIDATE_PRODUCTION_NO_DOTENV=1 pnpm run production:validate:live -- --no-dotenv` fails while populated only from `vibecore-platform-secrets` and `vibecore-vibecore-platform-platform-env`.
   - Passing groups: Google OAuth, GitHub OAuth, transactional email, workspace sandbox controls, runtime mode and AI provider keys.
   - Failing groups: Microsoft Entra/OIDC, SAML SSO, SIEM export, Stripe account live check, Stripe catalog, deployment providers, monitoring/incident response and rotation/SOC2 evidence.
   - Exact missing or invalid production values:
     - `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`, `OIDC_ISSUER_URL`, `OIDC_AUTHORIZATION_URL`, `OIDC_TOKEN_URL`, `OIDC_USERINFO_URL`, `OIDC_JWKS_URL`.
     - One complete SAML provider set: `SAML_ENTITY_ID`, `SAML_ACS_URL`, plus either `SAML_SSO_URL` and `SAML_X509_CERTIFICATE`, or `SAML_METADATA_URL`.
     - `SIEM_WEBHOOK_URL`, `SIEM_SIGNING_SECRET`.
     - The live `STRIPE_SECRET_KEY` is rejected by Stripe with `api_key_expired`.
     - `STRIPE_FREE_PRODUCT_ID`, `STRIPE_FREE_PRICE_ID`, `STRIPE_PRO_PRODUCT_ID`, `STRIPE_PRO_PRICE_ID`, `STRIPE_TEAM_PRODUCT_ID`, `STRIPE_TEAM_PRICE_ID`, `STRIPE_ENTERPRISE_PRODUCT_ID`, `STRIPE_ENTERPRISE_PRICE_ID`.
     - `DEPLOYMENT_PROVIDERS_ENABLED`.
     - `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `LOG_REDACTION_ENABLED=true`, `SECURITY_CONTACT_EMAIL`, `INCIDENT_WEBHOOK_URL`.
     - `SECRET_ROTATION_OWNER`, `SECRET_ROTATION_CADENCE_DAYS`, `AUDIT_RETENTION_DAYS`, `SOC2_EVIDENCE_BUCKET`, `BACKUP_ENCRYPTION_KEY`, `PRODUCTION_RUNBOOK_OWNER`.
   - Next action: populate or rotate the missing external/provider secrets, rerun live validation with `--no-dotenv`, then deploy.

4. **Stripe live test-mode flow is unverified.**
   - Current blocker: the configured live Stripe key is expired, so the catalog seed and `/v1/account` live validation cannot proceed.
   - Required proof: checkout, portal, signature rejection, duplicate event idempotency, invoice paid/failed, payment failed, upgrade, downgrade, cancel, trial.
   - Next action: rotate the Stripe live/test release key, run `pnpm stripe:seed`, store the returned product/price IDs in production secrets, then run the Stripe CLI/test-mode drill against staging.

5. **Backup restore is not proven.**
   - Current repo-local proof: `pnpm sre:validate` runs an encrypted project backup round-trip with manifest hash comparison and tamper rejection.
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
