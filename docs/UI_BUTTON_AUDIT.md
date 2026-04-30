# UI Button Audit

Last verified: 2026-04-29.

Scope: user dashboard, project IDE, project panels, project top bar, project actions and authenticated shell routes covered by `tests/e2e/dashboard.spec.ts`.

## Project IDE

| Area       | Control          | Real action                                                                      |
| ---------- | ---------------- | -------------------------------------------------------------------------------- |
| Top bar    | Project settings | Opens `settings` tab inside `/projects/:projectId/ide`                           |
| Top bar    | Rename           | Opens settings tab; Quick rename calls `/api/projects/:projectId/project-action` |
| Top bar    | Fork             | Calls backend duplicate flow and opens the new project IDE                       |
| Top bar    | Duplicate        | Calls backend duplicate flow and opens the new project IDE                       |
| Top bar    | Export           | Downloads `/projects/:projectId/export/zip` as `application/zip`                 |
| Top bar    | Delete           | Calls backend soft delete and returns to `/projects`                             |
| Top bar    | Help             | Opens support                                                                    |
| Top bar    | Notifications    | Opens notifications; IDE popover uses project activity from backend              |
| Top bar    | Share            | Opens collaborators in the IDE                                                   |
| Top bar    | Publish          | Opens deployments in the IDE                                                     |
| Agent      | Build/Discuss    | Updates the Bolt chat mode                                                       |
| Agent      | History          | Opens persisted project conversation list                                        |
| Agent      | New chat         | Clears current chat state through `useChat.setMessages`                          |
| Agent      | Settings         | Opens provider settings                                                          |
| Tabs       | `+`              | Opens tools/files popover in the single IDE workspace pane                       |
| Tabs       | Overflow menu    | Close others, close to right, close all and close saved                          |
| Status bar | Runtime          | Opens preview tab                                                                |
| Status bar | Terminal         | Toggles pinned bottom terminal                                                   |
| Status bar | Notifications    | Opens project notification center                                                |

## IDE Tools

| Tool           | Backend source/action                                                      |
| -------------- | -------------------------------------------------------------------------- |
| Files          | Runtime/workbench file store                                               |
| Search         | Existing Bolt search                                                       |
| Preview        | Runtime preview URL through existing Preview component                     |
| Logs           | `/projects/:projectId/dashboard` activity/workspace data                   |
| Snapshots      | `/projects/:projectId/snapshots` create/restore                            |
| Deployments    | `/projects/:projectId/deployments` create/list                             |
| Env vars       | `/projects/:projectId/env-vars` list/upsert                                |
| Secrets        | `/projects/:projectId/secrets` list/upsert, no plaintext by default        |
| Git            | `/projects/:projectId/git/*` status/commit/pull/push/PR                    |
| Activity       | `/projects/:projectId/activity`                                            |
| Collaborators  | `/projects/:projectId/collaborators`                                       |
| Domains        | `/orgs/:orgId/domains`                                                     |
| Settings       | `/projects/:projectId/settings`                                            |
| Database       | Real project env metadata, saves `DATABASE_URL` through backend env vars   |
| Object Storage | Real project env metadata, saves bucket variables through backend env vars |
| Packages       | Real indexed project files from dashboard                                  |
| Monitoring     | Real workspace/git/activity/deployment dashboard data                      |
| Extensions     | Real deployment-backed extension markers                                   |

## Verification

Run:

```bash
pnpm run typecheck
pnpm run lint
pnpm exec playwright test tests/e2e/dashboard.spec.ts --project=chromium
pnpm platform:verify
```

The E2E suite asserts in-place IDE panel routing, recursive split creation, tab action menu, pinned terminal shortcut, command palette shortcut, backend env write, zip export, route rendering and sign out.
