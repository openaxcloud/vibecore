# Projects and Storage

## Goal

Persistent SaaS projects wrap the existing Bolt IDE with durable project metadata, workspace files, exports and activity history.

## Storage architecture

- Postgres stores organizations, projects, collaborators, env vars, encrypted secrets, activity, Git metadata and snapshot metadata.
- PersistentVolumeClaim stores active workspace files for the runtime pod.
- S3-compatible cloud storage stores snapshot archives, zip imports and zip exports.
- GitHub can be used as an optional source of truth for repository-backed projects.
- Redis is the coordination layer for workspace locks, project events, autosave conflict detection and runtime availability signals.

## API surface

Project creation:

- `POST /orgs/:orgId/projects`
- `POST /orgs/:orgId/projects/from-template`
- `POST /orgs/:orgId/projects/from-ai`
- `POST /orgs/:orgId/projects/import/github`
- `POST /orgs/:orgId/projects/import/zip`

Project operations:

- `GET /projects/:projectId/dashboard`
- `GET /projects/:projectId/settings`
- `PATCH /projects/:projectId/settings`
- `DELETE /projects/:projectId`
- `POST /projects/:projectId/restore`
- `POST /projects/:projectId/transfer`
- `POST /projects/:projectId/duplicate`
- `POST /projects/:projectId/template`

Workspace files:

- `GET /projects/:projectId/files`
- `POST /projects/:projectId/files/import/zip`
- `GET /projects/:projectId/export/zip`

Configuration and governance:

- `GET /projects/:projectId/env-vars`
- `PUT /projects/:projectId/env-vars`
- `GET /projects/:projectId/secrets`
- `PUT /projects/:projectId/secrets`
- `GET /projects/:projectId/collaborators`
- `POST /projects/:projectId/collaborators`
- `GET /projects/:projectId/activity`

## Bolt IDE integration

- The project dashboard opens an IDE session with a `projectId`.
- The IDE resolves the workspace for that project and loads files through the runtime adapter.
- File explorer metadata comes from the persistent project file API.
- Runtime autosave writes to the remote runtime and updates project storage.
- Conflict detection uses project file timestamps and Redis locks/events.
- Runtime failures surface an offline warning without deleting local IDE state.

## Security

- Project access is enforced through backend RBAC on every project route.
- Secrets are encrypted before storage.
- Secret list responses hide plaintext values.
- Plaintext secret reveal requires explicit `reveal=true&key=...` and `security:manage`.
- Project secret values are not included in audit metadata or snapshot manifests.
- Snapshot manifests mark `excludesRuntimeSecrets: true`.
