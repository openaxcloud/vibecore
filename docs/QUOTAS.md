# Quotas

Quotas are enforced on the backend before costly actions run. The frontend can show warnings, but it is not the authority.

## Keys

- `projects.count`
- `workspaces.active`
- `workspaces.runtimeMinutes`
- `workspace.cpuMillicores`
- `workspace.ramMb`
- `storage.gb`
- `snapshots.count`
- `snapshots.sizeMb`
- `ai.messages`
- `ai.inputTokens`
- `ai.outputTokens`
- `ai.toolCalls`
- `deployments.count`
- `previews.public`
- `team.members`
- `terminals.concurrent`
- `api.rateLimitPerMinute`

## Enforcement Points

Current backend checks cover:

- Project creation/import/template/AI project creation
- Workspace creation and runtime start
- Snapshot creation
- AI messages, tokens and tool calls
- Deployment creation
- Organization member additions

Usage events are recorded after successful actions in `UsageEvent`. Admin overrides are stored in `QuotaOverride` and audited with `quota.override.create`.

## Override Rules

Admin quota overrides require:

- Backend permission `admin:write`
- Recent admin re-authentication
- Audit log entry
- Optional expiration timestamp
