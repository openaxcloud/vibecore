# Enterprise Readiness

This fork keeps the Bolt IDE intact and adds enterprise identity, governance and audit surfaces around the SaaS backend.

## Identity controls

- Email/password authentication uses scrypt password hashing.
- Email verification tokens are hashed at rest and expire after 24 hours.
- Password reset tokens are hashed at rest, expire after 30 minutes and revoke existing sessions after completion.
- Verification, reset and invitation tokens are delivered through SMTP when `SMTP_HOST` is configured, through an HTTP email provider when `EMAIL_HTTP_ENDPOINT` is configured, and are only echoed in API responses outside production.
- Sessions are stored as hashed opaque bearer tokens with device metadata, expiration, revocation and recent re-auth timestamps.
- Users can list active sessions, revoke a single session and log out all other devices.
- MFA uses TOTP secrets encrypted at rest and one-time recovery codes hashed at rest.
- Platform administrators are blocked from protected API use until MFA is enabled.
- Platform administrators can be bootstrapped with `PLATFORM_ADMIN_EMAILS` and managed through the audited backend platform-admin endpoint after MFA plus recent re-authentication.

## Enterprise governance

- Organization-scoped enterprise settings include IP allowlist, session duration policy, administrator MFA policy, data retention days and legal hold state.
- IP allowlist is enforced in the API for organization-scoped routes.
- Dangerous administration actions require a recent password re-authentication.
- Custom organization roles can be created with explicit backend permissions.
- Domain verification records are available for SSO and ownership workflows.

## SSO and provisioning

- Google and GitHub OAuth start endpoints build authorization URLs and callbacks perform token exchange, userinfo lookup and account linking.
- Generic OIDC callback support is available for Microsoft Entra ID and other OIDC providers through configured authorization, token and userinfo endpoints.
- Organization OIDC and SAML configurations are validated and encrypted before storage.
- SAML ACS requires an enabled organization SAML config and validates signed XML assertions against the configured certificate before user mapping.
- SCIM bearer tokens are returned once and stored only as hashes.
- SCIM user provisioning creates or reuses users and attaches them to the target organization.

## Audit and compliance readiness

- Critical auth, membership, settings, SSO, SCIM, project, workspace, billing, support and admin actions are audited.
- Audit metadata is secret-redacted before storage.
- Organization audit logs can be exported as JSON or CSV.
- SIEM webhook records store a hash for verification plus an encrypted signing secret for worker delivery.
- Data retention and legal hold settings are enforced by the enterprise worker: retention skips organizations under legal hold and deletes expired audit/project activity data for the others.

## SOC 2 and DPA readiness

- Access control is enforced on the backend with organization membership and RBAC checks.
- Secrets are redacted from API logs and encrypted where configuration needs retrieval.
- Audit events include actor, organization, action, resource and IP address fields.
- Retention, legal hold, SSO, SCIM and audit export controls are represented as product and data-model features.
- Production deployment is gated by `pnpm production:validate` and, when provider egress is available, `pnpm production:validate:live`.
- Operational evidence collection is defined in [Production Enterprise Validation](./PRODUCTION_ENTERPRISE_VALIDATION.md): change management records, vendor inventory, incident response process, backup restore tests, secret rotation and access review cadence.
