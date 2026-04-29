# Incident Response

## Severity

- SEV1: platform unavailable, data isolation issue, confirmed secret exposure, billing webhook outage.
- SEV2: major feature degraded, workspace starts failing broadly, AI provider outage without fallback.
- SEV3: localized degradation or elevated latency.

## Process

1. Declare incident and assign commander.
2. Open status page incident.
3. Collect request ids, correlation ids, traces, logs, dashboards, and recent changes.
4. Mitigate through rollback, feature flag, provider fallback, scaling, or workspace suspension.
5. Preserve audit logs and abuse events.
6. Publish updates every 30 minutes for SEV1/SEV2.
7. Produce postmortem within 5 business days.

## Evidence

Capture:

- timeline
- dashboards
- alerts
- affected orgs/users/projects
- remediation steps
- follow-up owners
