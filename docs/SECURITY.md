# Security

VibeCore is designed as a public SaaS that runs untrusted user code. Security controls are enforced in the backend, runtime adapter, workspace manager, workspace agent, Kubernetes manifests, and admission policies.

## Backend Controls

- All request bodies that mutate state are parsed with Zod schemas in `services/api`.
- CORS is allowlist based. Unknown origins do not receive CORS allow headers.
- Cookie-authenticated mutating requests require `x-csrf-token`.
- Authenticated routes require a valid session or bearer token, except health, auth, billing webhooks, SCIM, and selected public routes.
- RBAC is enforced server-side through `@vibecore/rbac`.
- Critical user actions write `AuditLog`; platform admin actions write `AdminAuditLog`.
- Secrets are encrypted before persistence and redacted from responses and logs.
- Passwords are hashed with scrypt using per-password salts.
- Platform admin routes require MFA and recent re-authentication where actions are dangerous.
- Sessions can be revoked individually or globally.
- Enterprise IP allowlists are enforced by the API pre-handler.
- Stripe webhooks require signature verification and are idempotent by event id.
- Helmet provides secure headers and a baseline CSP.

## Workspace Controls

- Workspaces run in Kubernetes pods with `runtimeClassName: gvisor`.
- Pods disable host networking, host PID, host IPC, service account token mounting, privilege escalation, and privileged mode.
- Workspace containers run as non-root UID/GID 1000, drop all Linux capabilities, and use `RuntimeDefault` seccomp.
- Only PVC-backed `/workspace` storage is mounted; hostPath and Docker socket mounts are not generated.
- CPU and memory requests and limits are set per plan.
- Default-deny NetworkPolicies restrict ingress and egress.
- Metadata service and private platform networks are blocked from workspace egress.
- Workspace secrets are injected only when explicitly allowed.

## Admission Controls

Kyverno policies in `infra/admission/kyverno/workspace-security-policies.yaml` enforce the workspace baseline at admission time:

- required workspace labels
- gVisor runtime
- resource requests and limits
- health probes
- no `:latest` container tags
- no privileged containers
- no host namespaces
- no hostPath
- non-root execution
- dropped capabilities
- `RuntimeDefault` seccomp

## Abuse Controls

The API and workspace agent block known abusive command patterns before execution:

- crypto mining
- fork bombs
- port scanning
- metadata server probing
- reverse shells
- shell-piped downloads
- command injection chains

Detected events create `AbuseEvent` records, audit entries, and can stop workspaces or suspend organizations based on severity.

## Production Requirements

- Configure strong `JWT_SECRET`, `COOKIE_SECRET`, and `CONFIG_ENCRYPTION_KEY`.
- Enforce HTTPS at the edge.
- Install Kyverno and apply admission policies before enabling remote workspaces.
- Run workspaces on a dedicated sandbox node pool.
- Route package installs through an allowlisted registry proxy where required.
- Send audit and abuse events to SIEM.
- Configure backup, restore, retention, and legal hold workflows.

## CI supply chain

- External GitHub Actions must be pinned to a full commit SHA. Mutable tags and
  branches are rejected by `scripts/validate-github-actions-pinned.mjs`.
- Container actions using `docker://...` must be pinned to a full `sha256`
  image digest; mutable tags and implicit `latest` references are rejected.
- A `uses:` value must be a literal local path or immutable external identity;
  YAML aliases and runtime expressions are rejected fail-closed.
- Composite actions under `.github/actions` are included in the same scan.
- Human-readable version comments are not trust anchors; the 40-character SHA
  is the executed identity.
- WIF proof workflows may assert a secret's expected prefix but must never
  print the fetched value; temporary response files are private to the runner
  and removed on exit.
- Temporary exceptions are exact and count-bound. Strict mode
  remains red until they are removed, so a partial migration cannot be
  presented as full supply-chain certification.
