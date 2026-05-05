# IDE and App Creation Audit

## Scope

This audit tracks the production contract for VibeCore app creation, the E-code IDE, live preview, agent streaming, and
project persistence. The product is not treated as an MVP: generated projects must be runnable, typed, inspectable in the
Preview tab, and backed by API/project storage instead of permanent mocks.

## Current Guarantees

- `/orgs/:orgId/projects/from-ai` creates a runnable React/Vite/TypeScript project with `dev`, `build`, and `preview`
  scripts.
- AI app-builder prompts generate an interactive enterprise command-center scaffold instead of rendering the raw prompt.
- The generated `src/App.tsx` includes working React state for navigation, search, status filters, create-workspace
  validation, telemetry refresh, approval actions, success/loading/empty/error states, and disabled controls.
- Project file metadata and IDE panels read backend project storage, environment variables, deployments, activity, git,
  collaboration, snapshots, and settings through API routes.
- Runtime preview files are synced back to project storage through a filtered zip import with `replaceExisting` support.
- Agent and project history state includes persisted IDE layout, selected files, locked items, and deleted paths.

## Acceptance Criteria For Each Step

- TypeScript passes for the changed package and the full app.
- Backend behavior has a targeted test for every new project-storage or generation contract.
- Generated apps must not show the user's raw instruction as the Preview experience.
- Preview must attach to a runnable app with no blank splash, no hidden setup step, and no permanently inert primary
  controls.
- Any mock-like data in the IDE must be replaced with backend state, a persisted local project state, or a clear empty
  state wired to an action.

## Next Audit Targets

- Add automated preview smoke coverage that builds or boots the generated AI scaffold and verifies visible interaction
  states.
- Expand IDE panel tests for env/secrets/packages/extensions/object-storage/database/logs so each panel has a backend
  loader/action contract.
- Add stream recovery tests that cover interruption, final-message persistence, and replay after navigation.
- Add visual regression coverage for light/dark panel menus, code-copy buttons, and preview toolbar density.
