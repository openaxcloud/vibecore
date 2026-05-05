# Privacy And Security Controls

## Data Protection

- Secrets are encrypted at rest.
- Runtime secrets are scoped per project and environment.
- Secrets are redacted from logs, API responses, deployment logs, and AI context.
- User deployment secrets are separate from platform secrets.

## Access Control

- Organization membership is checked server-side.
- RBAC permissions are enforced on protected resources.
- Enterprise IP allowlists are enforced at API entry.
- Platform admins require MFA.
- Dangerous admin actions require recent re-authentication.

## Logging

- Application logs must be structured JSON in production.
- Logs must not contain provider keys, project secrets, session tokens, or password reset tokens.
- Audit and admin audit logs are immutable from normal user flows.

## User Rights

Production operations must support:

- data export
- deletion requests
- organization-level retention settings
- legal hold overrides
- support ticket auditability
