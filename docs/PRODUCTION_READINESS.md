# Production Readiness Review

Date: 2026-05-26

Scope: strict final review for private beta, paid users, 1,000 users, and 10,000 users across the 34 requested platform areas.

Reviewed commit: `1e578a1d`.

## Verdict

This repository is **not approved for production launch**, paid users, 1,000 users, or 10,000 users.

It is a serious repo-local private beta candidate, but only after the live staging gates are executed successfully. The current evidence is mostly source code, unit/integration tests, local builds, generated audits, and infrastructure manifests. That is not the same as production proof.

This product is not assessed as an MVP. Permanent mocks are not acceptable substitutes for critical production flows. Bolt IDE preservation remains a hard requirement.

## Stage Readiness

| Stage | Verdict | Reason |
|---|---|---|
| Private beta | Conditional, not approved yet | Repo-local gates are strong. Blocking live gates remain: remote Kubernetes runtime, NetworkPolicy denied-traffic proof, Stripe test-mode webhooks, staging backup restore, staging Playwright E2E, and load baseline. |
| Paid users | Not approved | Billing and quotas are implemented locally, but Stripe secrets/catalog are missing in this environment and live webhook delivery/plan transitions are not verified. |
| 1,000 users | Not approved | k6 scripts exist, but no executed staging reports exist. Workspace lifecycle, DB/Redis pressure, preview throughput, and AI provider behavior are unmeasured. |
| 10,000 users | Not approved | No validated capacity model, no multi-region/DR decision proof, no measured GKE/Cloud SQL/Redis/AI-provider scaling data. |

## Acceptance Criteria Status

| Criterion | Status | Evidence |
|---|---|---|
| Code is real, typed, tested, documented, integrated | partial | `pnpm run typecheck`, `test`, `lint`, `build`, `ide:panel-audit`, `infra:validate`, `sre:validate`, `cicd:validate`, `mobile:validate`, and `desktop:test` pass. Live runtime, Stripe, backup, load, provider and mobile signing proof remain missing. |
| No permanent mock replaces a critical feature | partial | Production deploy provider guard and runtime mock scan exist. Non-production static/synthetic flows remain for local dev and must not be used as paid-user proof. |
| Existing Bolt IDE is preserved | complete | Workbench/chat components and project IDE route remain present; IDE panel audit passes 81/81. |
| Tests, build, typecheck, docs and acceptance checks pass before claiming completion | partial | Repo-local gates and GitHub Actions pass for `1e578a1d`. Cluster-only `pnpm run production:validate:live -- --no-dotenv` still fails on external provider/security/ops configuration, and the latest image is not deployed. |
| Platform can be called production ready | missing | Hard no-go gates remain open: workspace isolation live proof, gVisor admission enforcement live proof, NetworkPolicies live proof, Stripe live webhook proof, admin/browser audit, backup restore, load tests, rollback, mobile signing, and desktop release matrix. |

## Commands Run In This Review

Passed:

- `pnpm run production:validate:self-test`
- `pnpm run sre:validate`
- `pnpm run infra:validate`
- `pnpm run cicd:validate`
- `pnpm run mobile:validate`
- `pnpm run mobile:build:web`
- `pnpm run desktop:test`
- `pnpm run ide:panel-audit` -> 81 passed, 0 failed
- `pnpm run ide:panel-audit:validate`
- `pnpm run typecheck`
- `pnpm run test` -> 314 passed, 1 skipped
- `pnpm run lint`
- `pnpm run build`
- `pnpm run readiness:validate`
- `pnpm run platform:verify` -> mock scan, admin dangerous-action validation, readiness docs validation, lint, 314 tests, typecheck, client/SSR build, and infra validation passed
- `pnpm run platform:no-mocks`
- `pnpm run admin:dangerous-actions:validate` -> 21 admin mutations validated for re-auth and AdminAuditLog
- `pnpm exec vitest --run services/api/src/tests/api.spec.ts` -> 54 API tests passed, including platform-admin MFA/re-auth/audit and manual abuse-event re-auth/audit
- `pnpm run test:e2e` -> 127 passed, 17 breakpoint-specific skips across chromium, tablet, and mobile, including preview runtime and AI-created project startup coverage

Failed, and therefore blocking:

- `pnpm run production:validate`
  - Cluster-only live validation now passes Google OAuth, GitHub OAuth, transactional email, workspace sandbox controls, runtime mode and AI provider keys.
  - It still fails on Microsoft Entra/OIDC, SAML SSO, SIEM export, an expired Stripe key, missing Stripe product/price catalog IDs, deployment provider configuration, monitoring/incident response and rotation/SOC2 evidence variables.
- `pnpm run runtime:validate:api-kubernetes`
  - Must still pass against the deployed API/workspace-manager pair after the latest image is deployed.
  - Runtime configuration validates from Kubernetes Secret/ConfigMap state, but full workspace lifecycle E2E has not been rerun after the latest code changes.
- `pnpm run networkpolicies:validate:live`
  - Must still pass against the active staging or production workspace namespace.
  - Kubernetes access is available, but the denied-traffic drill has not been rerun in this review.

## Hard No-Go Checks

The platform must not be described as production ready until all of these are proven:

- Tests pass locally and in CI.
- Workspace isolation is proven in a live GKE workspace cluster.
- `runtimeClassName: gvisor` is enforced by live admission policy.
- NetworkPolicies are installed and denied-traffic drills pass.
- Backend quotas are enforced and measured under realistic concurrency.
- Stripe webhook signatures, idempotency, invoice events, payment failures, upgrades, downgrades, cancellations, and trials are verified in Stripe test mode.
- Admin dangerous actions are audited end-to-end with re-auth and AdminAuditLog rows.
- Secrets do not leak across API logs, runtime command output, AI tool output, admin views, deployment logs, and exported audit data.
- Mobile uses the CodeMirror fallback on phones and portrait tablets and this is validated on real devices.
- Desktop build/release matrix is tested for macOS, Windows, and Linux when desktop is in scope.
- Backup restore is executed against staging Cloud SQL and project storage with measured RTO/RPO.
- Load tests are executed against staging with published reports.
- Rollback is exercised in staging.

## Evidence Summary

Strong repo-local evidence exists for:

- Bolt IDE preservation.
- RuntimeAdapter abstraction with WebContainer and remote Kubernetes adapters.
- WebContainer local mode.
- Kubernetes workspace manifests using gVisor, non-root execution, dropped capabilities, no host namespaces, no hostPath, PVC-backed workspace storage, NetworkPolicies, ResourceQuota, LimitRange, and Kyverno policies.
- Auth, MFA, RBAC, SSO/SCIM source implementation and tests.
- Project CRUD, file operations, terminal, preview proxy, deployments, billing, quotas, admin, audit, abuse detection, observability assets, CI/CD assets, Terraform/Helm infra, mobile shell, and desktop smoke.
- Documentation coverage across runtime, security, billing, quotas, SSO/SCIM, rollback, backups, CI/CD, mobile, GCP, and compliance.

Live proof is still missing for:

- Remote Kubernetes runtime in real GKE.
- Workspace isolation and NetworkPolicy denied traffic in real cluster.
- Stripe live test-mode delivery.
- Real IdP OAuth/OIDC/SAML/SCIM tenants.
- Deployment provider sandbox deploy/rollback.
- Backup restore against real managed services.
- k6 load results.
- Native mobile signing/store distribution.
- Desktop signed release artifacts.
- Counsel-approved legal documents.

## Required Next Gate

Before private beta:

1. Apply Terraform to a dedicated staging GCP project.
2. Deploy Helm `platform` and `workspaces-runtime`.
3. Install Kyverno and prove workspace admission policy denial for non-gVisor/privileged/latest-tag pods.
4. Run `Staging Runtime Validation` and `runtime:validate:remote-kubernetes`.
5. Run `networkpolicies:validate:live` with exact Cloud SQL and Redis CIDRs.
6. Run Stripe CLI/test-mode webhook drills.
7. Run Playwright staging E2E for auth, projects, IDE, terminal, preview, billing, admin.
8. Run all five k6 load scripts and publish reports.
9. Execute backup restore and rollback drills.
10. Update this document and `COMPLETION_MATRIX.md` with evidence links.
