# Abuse Prevention

VibeCore runs user code and therefore treats workspaces as untrusted execution environments.

## Detection Signals

The platform detects and blocks:

- crypto mining commands and pool keywords
- fork bombs
- port scanning tools
- cloud metadata probing
- reverse shell patterns
- shell-piped downloads
- command injection chains
- excessive failed auth attempts
- workspace creation spikes
- excessive AI usage
- storage and CPU abuse
- spam preview traffic

## Actions

Depending on severity, the platform can:

- write an `AbuseEvent`
- write an audit event
- throttle the actor
- stop the workspace
- suspend the organization
- alert admins
- require manual review

## Enforcement Points

- `@vibecore/security` owns abuse classifiers.
- `services/api` blocks abusive AI tool and runtime command requests before they reach the workspace-agent.
- `services/workspace-agent` blocks abusive commands again inside the workspace boundary.
- Admin console routes expose abuse review and resolution.

## Operational Requirements

- Export abuse and audit events to SIEM.
- Alert on critical events, repeated high-severity events, and organization-wide spikes.
- Require manual review before reinstating suspended organizations.
