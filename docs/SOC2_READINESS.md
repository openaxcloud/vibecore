# SOC2 Readiness

This repository includes baseline controls that support SOC2 readiness, but SOC2 compliance requires operational evidence, policy ownership, vendor management, and recurring control execution.

## Security Controls

- Server-side authentication and RBAC
- MFA requirement for platform admins
- Admin audit logging
- Audit logging for critical customer actions
- Secret encryption and redaction
- Workspace sandboxing with gVisor
- Kubernetes admission policies
- Signed webhooks and idempotency
- Rate limiting and secure headers

## Availability Controls

- Health and readiness endpoints
- Workspace readiness and liveness probes
- Queue, database, Redis, Kubernetes, and provider health surfaces in admin
- Resource limits for user workspaces

## Confidentiality Controls

- Tenant isolation through organization/project membership checks
- Runtime secrets scoped to explicitly allowed project secrets
- NetworkPolicies that block platform-private networks

## Evidence To Collect In Production

- Access reviews
- MFA enforcement evidence
- Admin action audit samples
- Incident response records
- Backup and restore tests
- Vulnerability scans
- Dependency update history
- Kyverno policy reports
- SIEM alert evidence
- Change management records
