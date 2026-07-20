# Projects and Storage

## Goal

Persistent SaaS projects wrap the existing Bolt IDE with durable project metadata, workspace files, exports and activity history.

## Storage architecture

- Postgres stores organizations, projects, collaborators, env vars, encrypted secrets, activity, Git metadata and snapshot metadata.
- Postgres also stores durable `ProjectStorageObject` archive blobs for project exports and snapshots. API pods still keep a local cache for Git and fast archive reads, but snapshot restore falls back to the DB archive when another replica cannot read the original pod-local object.
- PersistentVolumeClaim stores active workspace files for the runtime pod.
- S3-compatible or GCS cloud storage remains the preferred large-scale archive tier; DB archive storage is the current durable shared baseline and checksum-verifies every fallback restore.
- GitHub can be used as an optional source of truth for repository-backed projects.
- Redis is the coordination layer for workspace locks, project events, autosave conflict detection and runtime availability signals.

## API surface

Project creation:

- `POST /orgs/:orgId/projects`
- `POST /orgs/:orgId/projects/from-ai`
- `POST /organizations/:orgId/gallery/apps/:galleryAppId/remix`
- `POST /organizations/:orgId/project-imports/preflight`
- `POST /organizations/:orgId/project-imports/:importJobId/create`
- `POST /organizations/:orgId/project-imports/:importJobId/retry`

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

## Snapshot restore durability

- Snapshot creation writes the pod-local archive and persists the same ZIP payload in `ProjectStorageObject`.
- Restore first tries the local archive path for speed.
- If the local object is missing because another API replica serves the request, restore loads the DB archive by `storageKey`.
- The DB archive is SHA-256 checked before unzip; checksum mismatch returns `SNAPSHOT_STORAGE_CHECKSUM_MISMATCH`.
- Missing local and durable archive returns `SNAPSHOT_STORAGE_MISSING` instead of silently restoring an empty project.

## Security

- Project access is enforced through backend RBAC on every project route.
- Secrets are encrypted before storage.
- Secret list responses hide plaintext values.
- Plaintext secret reveal requires explicit `reveal=true&key=...` and `security:manage`.
- Project secret values are not included in audit metadata or snapshot manifests.
- Snapshot manifests mark `excludesRuntimeSecrets: true`.
