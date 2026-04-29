# Realtime Collaboration

VibeCore project collaboration is exposed inside the existing IDE Collaboration tab and backed by persistent API state.

## Backend

- `GET /projects/:projectId/collaboration` returns collaborators, presence, comments, activity, share links, document sync state, terminal permissions, and AI conversation sharing policy.
- `POST /projects/:projectId/collaboration/presence` updates live user presence, cursor, selection, current file, mode, and terminal access.
- `DELETE /projects/:projectId/collaboration/presence/:sessionId` removes presence on disconnect or explicit cleanup.
- `POST /projects/:projectId/collaboration/comments` creates project/file comments.
- `POST /projects/:projectId/collaboration/edit` performs versioned collaborative document sync and returns `409 DOCUMENT_CONFLICT` when the caller base version is stale.
- `POST /projects/:projectId/collaboration/terminal-permissions` grants or revokes shared terminal access.
- `POST /projects/:projectId/collaboration/share-links` creates expiring project share links. Token hashes are stored; plain tokens are returned only once.
- `POST /projects/:projectId/collaboration/ai-conversation` controls shared AI conversation permissions.
- `GET /projects/:projectId/collaboration/ws` is the collaboration WebSocket. It broadcasts presence, comments, cursor and selection events to the project room.

## Persistence

Prisma migration `0009_realtime_collaboration` adds:

- `CollaborationPresence`
- `CollaborationComment`
- `ProjectShareLink`

Document sync state, terminal permissions and AI sharing policy are persisted in `ProjectIdeState.collaboration` so IDE reloads restore collaboration context with the rest of the project IDE state.

## Realtime Transport

The API uses an in-process room broker for local development and automatically enables Redis pub/sub when `REDIS_URL` is configured. Redis channels are prefixed by `COLLABORATION_REDIS_CHANNEL_PREFIX` or `vibecore:collaboration`.

## Security

- All routes require project/org membership through backend RBAC.
- Viewer collaborators are forced into read-only mode and cannot edit files.
- Project paths are normalized and path traversal is rejected.
- Shared terminal access is denied for viewer collaborators unless explicitly granted.
- Share links expire and store only hashed tokens.
- Collaboration actions write project activity and critical changes write audit events.
