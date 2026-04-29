# Data Retention

## Default Retention

- Audit logs: retained according to organization plan and compliance settings.
- Admin audit logs: retained for platform compliance and incident response.
- Project snapshots and exports: retained according to quota and project settings.
- Abuse events: retained for security investigation.
- Support tickets: retained according to support and legal policies.

## Deletion

- Project soft delete keeps recovery available until the configured retention window expires.
- Restore is blocked after permanent deletion.
- Runtime secrets are not included in snapshots or exports.

## Legal Hold

Legal hold settings prevent automated deletion for covered organizations, projects, and audit records.

## Production Jobs

Production deployments must run scheduled retention jobs that:

- purge expired soft-deleted projects
- remove expired snapshots and exports
- preserve legal-hold records
- write audit records for destructive retention actions
- redact deleted personal data where required
