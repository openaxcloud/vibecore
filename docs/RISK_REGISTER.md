# Risk Register

Date: 2026-04-29

| ID | Risk | Severity | Likelihood | Evidence | Impact | Mitigation | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| R-001 | Remote Kubernetes runtime not validated live | Critical | High | Repo tests pass, but no live GKE workspace proof in this review | IDE production mode may fail for users | Provision staging, run live runtime validation, block launch until green | Platform/runtime | Open |
| R-002 | Workspace isolation not proven in cluster | Critical | Medium | gVisor, NetworkPolicies, and admission policies exist locally | User code could reach platform/internal services if misapplied | Apply policies, run deny/allow tests, verify admission rejections | Security/SRE | Open |
| R-003 | Stripe flows not verified with real webhook delivery | Critical | Medium | Local API tests exist | Paid users could be billed incorrectly or quotas stale | Run Stripe CLI/test-mode events, verify idempotency and plan changes | Billing | Open |
| R-004 | Load capacity unknown | Critical | High | k6 scripts exist but no run results | 1k/10k users may overload DB, Redis, GKE, AI providers | Run staged load tests, define SLO/error budgets, tune capacity | SRE | Open |
| R-005 | Backup restore not proven | Critical | Medium | Dry-run docs/scripts exist | Data loss or extended outage | Execute staging restore drill with Cloud SQL and storage snapshots | SRE | Open |
| R-006 | External IdP SSO behavior unverified | High | Medium | SSO/SCIM readiness exists | Enterprise login/provisioning may fail | Test Google, GitHub, Entra/OIDC, SAML, and SCIM with real tenants | Identity | Open |
| R-007 | Admin route/button audit incomplete | High | Medium | Admin tests exist but full browser audit not proven | Dangerous actions could miss audit or re-auth | Add Playwright admin action audit and AdminAuditLog assertions | Admin/security | Open |
| R-008 | Secrets could leak through long-tail outputs | Critical | Medium | Redaction implemented, but broad runtime/log/provider paths exist | Credential exposure | Add secret canary tests for API, AI, deploy, runtime logs, admin views | Security | Open |
| R-009 | Preview ingress and custom domains unproven | High | Medium | Manifests/docs exist | User deployments/previews fail or route incorrectly | Validate wildcard TLS, preview proxy, custom domain mapping | Platform/SRE | Open |
| R-010 | Mobile/tablet quality not fully proven | Medium | Medium | CodeMirror fallback exists | Mobile beta users may hit editor/save issues | Run mobile/tablet Playwright and real-device testing | Web | Open |
| R-011 | Desktop release artifacts not verified in final pass | Medium | Medium | Scripts/workflows exist | Desktop users may receive broken binaries | Run macOS/Windows/Linux build matrix before desktop launch | Desktop | Open |
| R-012 | CI/CD not proven with real GitHub secrets | High | Medium | Workflow syntax validates locally | Deploy pipeline may fail under real permissions | Run workflows against staging with OIDC/secrets/environments | DevOps | Open |
| R-013 | Legal pages not counsel-approved | High | High | Pages/docs exist | Public launch compliance risk | Legal review for ToS, privacy, DPA, AUP, subprocessors | Legal | Open |
| R-014 | Abuse controls need tuning | High | Medium | Abuse detection implemented | Cost/security incidents may not be stopped quickly enough | Run abuse drills, tune thresholds, alert admins | Trust/Safety | Open |
| R-015 | Observability not proven live | High | Medium | Dashboards/alerts validate as assets | Incidents may be invisible | Deploy metrics/logging/tracing stack and run synthetic checks | SRE | Open |
| R-016 | GitHub/deployment providers not fully live-tested | High | Medium | Provider code/tests/docs exist | Deployments may fail for real users | Test provider sandboxes and document required credentials | Deployments | Open |

