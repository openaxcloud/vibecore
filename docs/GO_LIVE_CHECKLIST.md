# Go-Live Checklist

Date: 2026-04-29

This checklist is intentionally conservative. Do not use it to approve production launch until every required live gate is checked with evidence links.

## Repo Gates

- [x] Typecheck passes.
- [x] Lint passes.
- [x] Unit tests pass.
- [x] API tests pass with Prisma/PostgreSQL enabled.
- [x] Workspace manager tests pass.
- [x] Workspace agent tests pass.
- [x] AI gateway tests pass.
- [x] CI/CD workflow YAML validates locally.
- [x] Helm templates render locally.
- [x] Terraform validates locally.
- [x] Security, observability, backup, CI/CD, GCP, and runtime docs exist.

## Staging Environment Gates

- [ ] Terraform applied to a dedicated staging GCP project.
- [ ] Private app GKE cluster provisioned.
- [ ] Private workspace GKE cluster provisioned.
- [ ] Workload Identity configured and verified.
- [ ] Cloud SQL private IP only.
- [ ] Redis private only.
- [ ] Secret Manager used for all runtime secrets.
- [ ] Helm platform chart deployed.
- [ ] Helm workspaces-runtime chart deployed.
- [ ] cert-manager DNS01 and wildcard preview TLS verified.
- [ ] RuntimeClass `gvisor` exists in the workspace cluster.
- [ ] Workspace admission policies reject pods without `runtimeClassName: gvisor`.
- [ ] NetworkPolicies deny unauthorized ingress/egress.
- [ ] Metadata server egress is blocked from workspace pods.
- [ ] Platform DB/Redis/internal ranges are blocked from workspace pods.

## Runtime Gates

- [ ] Start a remote workspace from the IDE.
- [ ] Read the file tree through RuntimeAdapter.
- [ ] Edit and save a file through RuntimeAdapter.
- [ ] Run a command through RuntimeAdapter.
- [ ] Open terminal WebSocket through ingress.
- [ ] Stream workspace logs.
- [ ] Detect ports.
- [ ] Open preview URL with TLS.
- [ ] Stop, restart, and delete workspace.
- [ ] Verify PVC persistence across restart.
- [ ] Verify idle auto-sleep and garbage collection.

## Product Gates

- [ ] Auth signup/login/verification/reset tested end-to-end.
- [ ] MFA enrollment/recovery tested end-to-end.
- [ ] Admin MFA and re-auth tested.
- [ ] OAuth Google/GitHub tested against real provider apps.
- [ ] Entra/OIDC tested against a real tenant.
- [ ] SAML ACS, assertion validation, signatures, and user mapping tested against a real IdP.
- [ ] SCIM provisioning tested with a real SCIM client.
- [ ] Project create/import/export/snapshot/restore tested.
- [ ] GitHub import, branch, commit, push, pull, and PR tested.
- [ ] Deployments tested for selected launch providers.
- [ ] Custom domain flow tested.
- [ ] Collaboration two-user edit/presence/cursor/comment flow tested.
- [ ] Tablet and mobile editor fallback tested on real devices.
- [ ] Desktop build smoke tested on macOS, Windows, and Linux if desktop is in launch scope.

## Billing And Quota Gates

- [ ] Stripe checkout tested in test mode.
- [ ] Stripe customer portal tested.
- [ ] Webhook signature rejection tested live.
- [ ] Duplicate webhook idempotency tested live.
- [ ] Trial, upgrade, downgrade, cancel, payment failed, invoice paid, and invoice failed tested.
- [ ] Plan quota changes reflected in backend.
- [ ] Quota exceeded blocks backend actions.
- [ ] Usage events recorded after successful actions.
- [ ] Admin quota override audited.
- [ ] Billing state displayed correctly in dashboard.

## Security Gates

- [ ] CORS verified for production domains only.
- [ ] CSRF verified if cookies are used.
- [ ] Secure headers and CSP verified.
- [ ] Secrets redacted in API logs, deployment logs, AI tool output, runtime command output, and admin UI.
- [ ] Encrypted secrets verified in database.
- [ ] Signed webhook verification tested.
- [ ] RBAC bypass tests run.
- [ ] Org isolation tests run.
- [ ] Path traversal tests run.
- [ ] Command injection/blocklist tests run.
- [ ] Abuse detection drills run.
- [ ] AdminAuditLog verified for every dangerous action.
- [ ] External security review planned before paid launch.

## Operations Gates

- [ ] Prometheus metrics scraped.
- [ ] Grafana dashboard imported.
- [ ] Alert rules loaded.
- [ ] Sentry-compatible reporting tested.
- [ ] Synthetic health checks running.
- [ ] Cloud SQL backup enabled.
- [ ] Cloud SQL point-in-time recovery configured.
- [ ] Project snapshot lifecycle configured.
- [ ] Backup restore drill completed.
- [ ] Disaster recovery runbook exercised.
- [ ] Rollback exercised in staging.
- [ ] Status page process documented and tested.

## Scale Gates

- [ ] k6 API load test executed.
- [ ] k6 workspace lifecycle load test executed.
- [ ] k6 preview load test executed.
- [ ] k6 AI simulated load test executed.
- [ ] k6 billing webhook load test executed.
- [ ] Private beta load target met.
- [ ] 1,000-user load target met.
- [ ] 10,000-user capacity plan validated.
- [ ] Cost model updated from observed metrics.

