# Snapshots

## Snapshot types

Persistent projects support three snapshot classes:

- `manual`: created by a user before a risky change or release.
- `automatic`: created by policy or scheduler.
- `before-ai-change`: created before large AI edits are applied.

## API

- `GET /projects/:projectId/snapshots`
- `POST /projects/:projectId/snapshots`
- `POST /projects/:projectId/snapshots/before-ai-change`
- `POST /projects/:projectId/snapshots/:snapshotId/restore`

## Storage model

Snapshot metadata is stored in Postgres:

- project id
- label
- kind
- manifest
- storage key
- archive byte length
- creator
- timestamp

Snapshot file archives are stored in S3-compatible cloud storage. Active runtime files remain on the workspace PersistentVolumeClaim.

## Secret handling

Runtime secrets are excluded from snapshot manifests and archives. Project secret records stay in Postgres as encrypted values and are restored independently from file snapshots.

## Restore behavior

Restore validates project access with backend RBAC, reads the snapshot archive from object storage and replaces the active workspace file set. The restore action is recorded in project activity and audit logs.

## Automatic checkpoints

The scheduler or AI action runner should call `POST /projects/:projectId/snapshots` with `kind=automatic` on policy intervals, and `POST /projects/:projectId/snapshots/before-ai-change` before large AI-generated file changes.
