# Production Enterprise Validation

This document defines the final operational gate for running Vibecore as an enterprise SaaS. The codebase must pass local verification, and the production environment must pass external-provider validation before traffic is routed to it.

## Required Command

Run this in the target production environment:

```bash
pnpm production:validate
```

Run this when egress to external providers is available from the release environment:

```bash
pnpm production:validate:live
```

The strict validator fails when a required provider, secret, URL, rotation setting, monitoring endpoint or SOC2 evidence setting is missing, local-only, or placeholder-like.

## Provider Validation Scope

The production gate covers:

- Google OAuth: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_URL`, `GOOGLE_USERINFO_URL`
- GitHub OAuth: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_REDIRECT_URI`, `GITHUB_TOKEN_URL`, `GITHUB_USERINFO_URL`
- Microsoft Entra / OIDC: `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_REDIRECT_URI`, `OIDC_ISSUER_URL`, `OIDC_AUTHORIZATION_URL`, `OIDC_TOKEN_URL`, `OIDC_USERINFO_URL`, `OIDC_JWKS_URL`
- SAML: either direct IdP config with `SAML_ENTITY_ID`, `SAML_ACS_URL`, `SAML_SSO_URL`, `SAML_X509_CERTIFICATE`, or metadata config with `SAML_ENTITY_ID`, `SAML_ACS_URL`, `SAML_METADATA_URL`
- Transactional email: either SMTP with credentials and sender, or HTTP email provider with token and sender
- SIEM export: `SIEM_WEBHOOK_URL`, `SIEM_SIGNING_SECRET`
- Stripe catalog and webhook secrets
- Deployment providers: `DEPLOYMENT_PROVIDERS_ENABLED` must list the beta/production providers. `static` needs no external env; non-static providers require their real dispatch env (`VERCEL_DEPLOY_HOOK_URL`, `NETLIFY_BUILD_HOOK_URL`, `CLOUDFLARE_DEPLOY_HOOK_URL`, `GITHUB_DEPLOY_TOKEN` + `GITHUB_PAGES_REPO` + `GITHUB_PAGES_WORKFLOW`, `CLOUD_RUN_BUILD_TRIGGER_URL` + `GCP_OAUTH_TOKEN`, or `DOCKER_BUILD_TRIGGER_URL` + `GCP_OAUTH_TOKEN` + `DOCKER_REGISTRY_URL`) and its matching `*_DEPLOY_TARGET_DEDICATED=true` plus `*_DEPLOY_TARGET_VIBECORE_PROJECT_ID`. This target is immutable and may be assigned to one project only.
- Workspace sandbox controls: `WORKSPACE_DISABLE_SANDBOX_SCHEDULING` must not be `1` in production.
- Runtime mode: `VITE_RUNTIME_MODE=remote-kubernetes`, `VITE_RUNTIME_API_BASE_URL` must point to `/api/runtime`, `WORKSPACE_MANAGER_URL` must be HTTPS or an internal Kubernetes service DNS URL, and `WORKSPACE_RUNTIME_NAMESPACE`, `WORKSPACE_AGENT_IMAGE`, `PREVIEW_PROXY_SHARED_SECRET`, and `PREVIEW_URL_TEMPLATE` must be set.
- At least one production AI provider key or self-host endpoint
- PostgreSQL, Redis, JWT, cookie, config encryption and workspace-agent token secrets
- OpenTelemetry, incident response, log redaction, secret rotation and evidence retention settings

Production URLs that receive browser callbacks or sensitive telemetry must use HTTPS.

## Live Checks

`pnpm production:validate:live` performs network checks where safe:

- OIDC discovery is fetched from `OIDC_ISSUER_URL`.
- SAML metadata is fetched when `SAML_METADATA_URL` is configured.
- SMTP credentials are verified with the configured provider.
- Public OAuth and SIEM endpoint reachability is checked without sending sensitive payload content.

Live checks must be run from the same network policy and egress path used by the production API/worker pods.

## Release Gate

A production release is allowed only when all of the following are true:

- `pnpm platform:verify` passes.
- `pnpm production:validate` passes in the release environment.
- `pnpm production:validate:live` passes from the production network or an approved pre-production network with equivalent egress controls.
- Database migrations have been applied and verified against the target PostgreSQL cluster.
- Redis/BullMQ workers are running and SIEM delivery has a successful cursor advance.
- OpenTelemetry traces, metrics and structured logs are visible in the production monitoring backend.
- Backup restore has been exercised for the current release train.

## Secret Rotation

Required operational settings:

- `SECRET_ROTATION_OWNER`: accountable team or mailbox.
- `SECRET_ROTATION_CADENCE_DAYS`: maximum days between planned rotations, 1 to 180.
- `BACKUP_ENCRYPTION_KEY`: production backup encryption material from the approved secret manager.
- `PRODUCTION_RUNBOOK_OWNER`: accountable operations owner.

Rotation procedure:

1. Create the new secret in the production secret manager.
2. Deploy to a single canary API/worker instance with both old and new credentials accepted when the provider supports overlap.
3. Verify auth callbacks, email delivery, SIEM export, billing webhook verification and AI provider requests.
4. Roll the remaining instances.
5. Revoke the old secret at the provider.
6. Attach validation output and provider audit evidence to the SOC2 evidence location.

## Monitoring Requirements

Required settings:

- `OTEL_SERVICE_NAME`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `LOG_REDACTION_ENABLED=true`
- `SECURITY_CONTACT_EMAIL`
- `INCIDENT_WEBHOOK_URL`

Signals that must be watched:

- API 5xx and auth callback failures.
- SAML assertion validation failures.
- SMTP delivery failures.
- SIEM delivery failures and stale cursors.
- Stripe webhook verification failures.
- Workspace start failures and Kubernetes scheduling failures.
- AI provider fallback rate and quota-denied events.

## SOC2 Evidence

Required settings:

- `SOC2_EVIDENCE_BUCKET`
- `AUDIT_RETENTION_DAYS` of at least 365.

Evidence to retain per release:

- Output of `pnpm platform:verify`.
- Output of `pnpm production:validate`.
- Output of `pnpm production:validate:live`.
- Migration run logs.
- Access review approval.
- Change approval.
- Secret rotation status.
- Backup restore result.
- Incident and support escalation contacts.

The validator does not certify SOC2 by itself. It makes the missing operational dependencies explicit and fails the release when the runtime environment is incomplete.
