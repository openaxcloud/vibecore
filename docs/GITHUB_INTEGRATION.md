# GitHub Integration

## Capabilities

Persistent projects can use GitHub as an optional source of truth:

- import repository
- inspect Git status
- commit workspace changes
- push branch
- pull branch
- list branches
- create pull request

## API

- `POST /orgs/:orgId/projects/import/github`
- `GET /projects/:projectId/git/status`
- `POST /projects/:projectId/git/commit`
- `POST /projects/:projectId/git/push`
- `POST /projects/:projectId/git/pull`
- `GET /projects/:projectId/git/branches`
- `POST /projects/:projectId/git/pull-requests`

## Security

All Git operations require project access through backend RBAC. Repository URLs and branch names are stored as project metadata. OAuth tokens or installation tokens must be stored as encrypted secrets and must never be logged.

## Runtime flow

1. Import clones repository content into the persistent workspace.
2. The Bolt IDE edits files through the runtime adapter.
3. Autosave writes files to the active workspace volume.
4. Git status reflects workspace changes.
5. Commit and push use the configured GitHub credential.
6. Pull request creation records the resulting URL in project activity and audit logs.

## Mocking

The API uses a `GitProvider` interface. Tests use `MockGitProvider`, so Git behavior is covered without reaching GitHub.
