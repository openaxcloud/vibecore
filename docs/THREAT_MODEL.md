# Threat Model

## Assets

- User code and project files
- Organization and billing data
- Provider API keys and runtime secrets
- Workspace pods and PVCs
- AI provider credentials
- Admin controls and audit logs

## Trust Boundaries

- Browser to API
- API to PostgreSQL and Redis
- API to workspace-manager
- Workspace-manager to Kubernetes API
- API/runtime adapter to workspace-agent
- Workspace pod to public internet
- Billing provider webhooks to API

## Primary Threats

- Cross-tenant data access
- RBAC bypass
- Session theft
- CSRF against cookie sessions
- Secret exfiltration through logs or previews
- Malicious workspace commands
- Crypto mining and CPU abuse
- Port scanning and suspicious egress
- Workspace breakout attempts
- Admission bypass through unsafe manifests
- Webhook spoofing or replay
- Admin account takeover

## Mitigations

- Backend auth and RBAC guards on protected routes
- Organization/project membership checks for tenant resources
- Strict input validation with Zod
- Cookie CSRF token requirement
- Strong password hashing, MFA for platform admins, and session revocation
- Secret encryption and log redaction
- Runtime command abuse detection in API and workspace-agent
- gVisor workspace isolation and restrictive pod security context
- Default-deny NetworkPolicies and metadata/private network blocking
- Kyverno admission policies
- Signed webhooks and idempotency
- AdminAuditLog for every platform admin action

## Residual Risks

- Kubernetes NetworkPolicy cannot enforce DNS/FQDN package registry allowlists by itself. Production environments should deploy an egress gateway or registry proxy.
- gVisor reduces but does not eliminate kernel and runtime risk. Runtime nodes must be patched and monitored.
- AI prompt injection remains a data handling risk. Tool calls remain RBAC-scoped and audited.
