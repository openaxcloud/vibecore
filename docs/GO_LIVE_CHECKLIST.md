# Go-Live Checklist

Date: 2026-05-26

This checklist is conservative. A box is checked only when the current repo or this review has direct evidence. Production launch stays blocked until every required live gate has a linked run, dashboard, log query, or signed-off artifact.

## Repo Gates

- [x] `pnpm run production:validate:self-test`
- [x] `pnpm run typecheck`
- [x] `pnpm run test`
- [x] `pnpm run lint`
- [x] `pnpm run build`
- [x] `pnpm run platform:no-mocks`
- [x] `pnpm run readiness:validate`
- [x] `pnpm run sre:validate`
- [x] `pnpm run infra:validate`
- [x] `pnpm run cicd:validate`
- [x] `pnpm run mobile:validate`
- [x] `pnpm run mobile:build:web`
- [x] `pnpm run desktop:test`
- [x] `pnpm run ide:panel-audit`
- [x] `pnpm run ide:panel-audit:validate`
- [x] `pnpm run test:e2e` passed: 127 passed, 17 breakpoint-specific skips across chromium, tablet, and mobile.
- [x] `pnpm run platform:verify`
- [x] GitHub Actions on `main` commit `1e578a1d`: CI/CD, Production CI, Code Quality, Security Analysis and Docs CI/CD passed.

## Blocking Production Gates

- [ ] `pnpm run production:validate` passes with real production/staging secrets.
  - Latest cluster-only result: `VALIDATE_PRODUCTION_NO_DOTENV=1 pnpm run production:validate:live -- --no-dotenv` fails on Entra/OIDC, SAML, SIEM, expired Stripe key, missing Stripe catalog IDs, deployment provider configuration, monitoring/incident response and rotation/SOC2 evidence.
  - Passing in the same run: Google OAuth, GitHub OAuth, transactional email, workspace sandbox controls, runtime mode and AI provider keys.
- [x] Preview runtime local E2E passes for imported project content, package-script Vite apps, template-created projects, and AI-created projects.
- [x] IDE panel audit passes for all workspace/service panels: 81/81.
- [x] `VITE_RUNTIME_MODE=remote-kubernetes`.
- [x] `VITE_RUNTIME_API_BASE_URL` and `WORKSPACE_MANAGER_URL` point to the deployed runtime or internal Kubernetes service URL.
- [ ] Latest committed image is deployed to production.
  - Current production deployments still run `sha-1116d9d`; latest `main` is `1e578a1d`.
- [ ] `pnpm run runtime:validate:api-kubernetes` passes against the deployed API/workspace-manager pair after the latest image is deployed.
- [ ] `pnpm run runtime:validate:remote-kubernetes` passes against staging or production GKE.
  - Current status: runtime configuration validates, but full workspace lifecycle E2E has not been rerun after the latest code changes.
- [ ] `pnpm run networkpolicies:validate:live` passes.
  - Current status: Kubernetes access is available, but the denied-traffic drill has not been rerun in this review against the active workspace namespace.
- [ ] GitHub Actions `Staging Runtime Validation` passes and its run id is supplied to production deploy.
- [ ] `deploy-prod.yml` production validation step passes before GCP authentication or Helm deploy.

## Staging Infrastructure Gates

- [ ] Terraform applied to dedicated staging GCP project.
- [ ] App GKE cluster reachable through private service configuration.
- [ ] Workspace GKE cluster reachable and has gVisor node pool.
- [ ] `RuntimeClass/gvisor` exists.
- [ ] Kyverno installed.
- [ ] `ClusterPolicy/vibecore-workspace-security-baseline` is `Enforce`.
- [ ] Admission rejects pods without `runtimeClassName: gvisor`.
- [ ] Admission rejects privileged, hostNetwork, hostPID, hostIPC, hostPath, latest-tag, missing-resource-limit workspace pods.
- [ ] Platform and workspace NetworkPolicies installed.
- [ ] Metadata server egress blocked from workspace pods.
- [ ] Cloud SQL, Redis, and internal CIDRs blocked from workspace pods.
- [ ] Ingress namespace selector in Helm matches the real ingress controller namespace labels.
- [ ] Cloud SQL private IP and PITR verified.
- [ ] Redis private `STANDARD_HA` verified.
- [ ] Secret Manager integration verified.
- [ ] cert-manager and wildcard preview TLS verified.

## Runtime Gates

- [ ] Start remote workspace from API.
- [ ] Start remote workspace from IDE.
- [ ] File tree list/read/write/create/delete/rename/search/watch works through RuntimeAdapter.
- [ ] Terminal WebSocket opens through ingress.
- [ ] Terminal reconnect and resize work.
- [ ] Command streaming works.
- [ ] Logs stream from workspace manager and IDE.
- [ ] Preview port discovery works.
- [ ] Preview URL works with TLS.
- [ ] Stop/restart/delete workspace works.
- [ ] PVC survives restart.
- [ ] Idle sleep and garbage collection observed.

## Product Gates

- [ ] Signup/login/logout E2E.
- [ ] Email verification and password reset E2E through real SMTP or email provider.
- [ ] MFA enrollment, login challenge, recovery codes E2E.
- [ ] OAuth Google and GitHub through real provider apps.
- [ ] OIDC through real tenant with JWKS verification.
- [ ] SAML ACS through real IdP.
- [ ] SCIM provisioning/deactivation through real client.
- [ ] Project create/import/export/snapshot/restore E2E.
- [ ] GitHub import/branch/commit/push/PR E2E.
- [ ] IDE file/editor/terminal/preview/workflows/settings/integrations panels E2E.
- [ ] Collaboration two-user presence/edit/comment/share-link E2E.
- [ ] Deployment provider E2E for every enabled beta provider.
- [ ] Provider rollback E2E for every enabled rollback-capable provider.
- [ ] Custom domain E2E.

## Billing And Quota Gates

- [ ] Stripe checkout in test mode.
- [ ] Stripe portal in test mode.
- [ ] Stripe webhook signature rejection drill.
- [ ] Duplicate webhook idempotency drill.
- [ ] Invoice paid/failed, payment failed, trial, upgrade, downgrade, cancel events verified.
- [ ] Plan quota changes visible on next backend request.
- [ ] Quota exceeded returns backend 429 and records audit/usage.
- [ ] Runtime workspace quota blocks concurrent over-limit starts.
- [ ] Admin quota override audited and expires server-side.
- [ ] Billing dashboard matches backend/Stripe state.

## Security Gates

- [x] Auth and sensitive admin rate-limit code exists and is tested.
- [x] CSP script inline/eval hardening exists.
- [x] Secret redaction tests exist.
- [x] gVisor and restricted workspace pod manifests are asserted by tests.
- [x] Production CORS allowlist verified. Production boot now rejects empty/dev-default/HTTP allowlists in `services/api/src/app.ts` (`b9f2272`), spec covers boot-fail + happy-path reflection.
- [ ] CSRF mutation coverage verified browser/API-wide.
- [x] CSP style nonce/hash strategy completed or risk-accepted for private beta. Risk-accepted for private beta in `docs/RISK_REGISTER.md` R-019 (script-src already strict; style nonce/hash to land before GA).
- [ ] Canary secret verified across API logs, runtime output, AI tool output, admin views, audit export and deployment logs.
- [ ] External penetration test scheduled before paid launch.
- [ ] Admin dangerous action browser audit passes.
- [ ] SIEM abuse delivery observed against real target.

## Operations Gates

- [ ] Prometheus metrics scraped from staging.
- [ ] Grafana dashboard imported and populated.
- [ ] Alert rules loaded and routed to on-call.
- [ ] Synthetic checks running.
- [ ] Sentry/OTLP errors visible.
- [ ] Cloud SQL restore drill executed.
- [ ] Project storage restore drill executed.
- [ ] RTO/RPO measured and documented.
- [ ] Disaster recovery runbook exercised.
- [ ] Helm rollback exercised.
- [ ] Terraform rollback/backout exercised.
- [ ] Status page process tested.

## Scale Gates

- [ ] `tests/load/api-load.js` executed against staging.
- [ ] `tests/load/workspace-lifecycle-load.js` executed against staging.
- [ ] `tests/load/preview-load.js` executed against staging.
- [ ] `tests/load/ai-simulated-load.js` executed against staging.
- [ ] `tests/load/billing-webhook-load.js` executed against staging.
- [ ] Private beta target met.
- [ ] 1,000-user target met.
- [ ] 10,000-user capacity model validated.
- [ ] Cost model updated from measured metrics.

## Mobile And Desktop Gates

- [x] Mobile web build passes.
- [x] Mobile asset validation passes.
- [x] Desktop smoke test passes.
- [ ] iOS signed IPA/TestFlight pipeline verified.
- [ ] Android signed AAB/Play internal track verified.
- [ ] `pnpm run mobile:validate:release` passes with a production app link host.
  - Latest local result: fails because `app_link_host` is still `app.example.com`.
- [ ] `pnpm run mobile:release-assets:check` passes with production mobile release metadata.
  - Latest local result: fails because `MOBILE_APP_LINK_HOST` is not configured.
  - Tooling dry-run with production-shaped synthetic metadata passes, so the remaining blocker is real release metadata, not the generator.
- [ ] APNs and FCM verified.
- [ ] Real phone/tablet editor fallback QA completed.
- [ ] macOS signed build verified.
- [ ] Windows signed build verified.
- [ ] Linux package verified.
- [ ] Desktop auto-updater drill completed.

## Legal And Compliance Gates

- [ ] Counsel-reviewed Terms of Service.
- [ ] Counsel-reviewed Privacy Policy.
- [ ] DPA.
- [ ] Subprocessor list.
- [ ] AUP linked from signup.
- [ ] Data retention policy aligned with implementation.
- [ ] SOC2 control owners assigned.
