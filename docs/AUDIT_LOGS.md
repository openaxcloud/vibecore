# Audit Logs

## Coverage

The API records audit events for critical actions including:

- registration, login, email verification, password reset, re-authentication and MFA changes
- session revocation and logout-all
- organization, membership, project, workspace, snapshot and deployment changes
- billing checkout, support ticket creation, admin settings and abuse events
- enterprise settings, domain verification, SSO configuration, SCIM token creation and SCIM provisioning
- audit export and SIEM webhook creation
- platform administrator grant/revoke actions

## Route Matrix

| Area | Mutating routes | Audit actions |
| --- | --- | --- |
| Auth | `/auth/register`, `/auth/login`, `/auth/verify-email`, `/auth/password-reset/*`, `/auth/reauth`, `/auth/mfa/*`, `/auth/recovery-codes`, `/auth/sessions/*`, `/auth/logout-all` | `auth.*` |
| OAuth/OIDC/SAML | `/auth/oauth/:provider/callback`, `/auth/oidc/callback`, `/auth/saml/:orgId/acs`, `/orgs/:orgId/sso/*` | `auth.oauth.*`, `auth.oidc.login`, `auth.saml.login`, `sso.*.update` |
| Platform Admin | `/admin/users/:userId/platform-admin` | `admin.platform_admin.grant`, `admin.platform_admin.revoke` |
| Organizations | `/orgs`, `/orgs/:orgId/memberships`, `/orgs/:orgId/invitations/*`, `/orgs/:orgId/enterprise-settings`, `/orgs/:orgId/domains/*`, `/orgs/:orgId/roles`, `/orgs/:orgId/scim/tokens` | `org.*`, `member.*`, `invite.*`, `enterprise_settings.update`, `domain.*`, `role.create`, `scim.token.create` |
| SCIM | `/scim/v2/:orgId/Users` | `scim.user.provision` |
| Projects | `/orgs/:orgId/projects*`, `/projects/:projectId/*` settings, collaborators, delete/restore/transfer/duplicate/templates | `project.*` |
| Storage | `/projects/:projectId/env`, `/projects/:projectId/secrets`, `/projects/:projectId/snapshots/*`, import/export routes | `project.env.*`, `project.secret.*`, `snapshot.*`, `project.import.*`, `project.export.*` |
| Git/Deployments | `/projects/:projectId/git/*`, `/projects/:projectId/deployments` | `git.*`, `deployment.create` |
| Admin/Support/Abuse | `/admin/*`, `/support/*`, `/admin/abuse-events`, `/admin/system-settings`, feature flags, billing, usage | `admin.*`, `support.*`, `abuse.*`, `system_setting.*`, `feature_flag.*`, `billing.*`, `usage.*` |
| Audit/SIEM | `/orgs/:orgId/audit-logs/export`, `/orgs/:orgId/siem-webhooks` | `audit.export`, `siem.webhook.create` |

## Event shape

Audit events include:

- `createdAt`
- `organizationId`
- `actorUserId`
- `action`
- `resourceType`
- `resourceId`
- `metadata`
- `ipAddress`

Metadata is redacted before storage using the shared security redaction rules for passwords, cookies, authorization headers, secrets, tokens and API keys.

## Export

Organization logs can be listed with:

```http
GET /orgs/:orgId/audit-logs
```

Exports are available as JSON or CSV:

```http
GET /orgs/:orgId/audit-logs/export?format=json
GET /orgs/:orgId/audit-logs/export?format=csv
```

Export requires `audit:export`. Export actions are themselves audited.

## SIEM

SIEM webhook records are created with:

```http
POST /orgs/:orgId/siem-webhooks
```

The webhook secret is hashed for verification and stored encrypted for delivery signing. The enterprise worker reads enabled webhook records, sends only audit events newer than `lastDeliveredAt`, signs each payload with `x-vibecore-signature: sha256=<hmac>`, and advances the delivery cursor only after a successful response.

Production SIEM configuration is part of the release gate. `pnpm production:validate` requires `SIEM_WEBHOOK_URL` and `SIEM_SIGNING_SECRET`; `pnpm production:validate:live` verifies endpoint reachability from the release environment without sending audit payload content.

## Retention and legal hold

Organization retention settings are stored in enterprise settings:

- `dataRetentionDays`
- `legalHoldEnabled`

The enterprise retention worker skips deletion when legal hold is enabled and otherwise removes audit/project activity data according to the configured retention period.
