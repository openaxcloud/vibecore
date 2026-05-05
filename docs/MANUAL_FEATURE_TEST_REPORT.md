# Manual Feature Test Report

Date: 2026-05-01

Verdict: the local web application can be started and the core IDE flows render, connect, and respond. This is not a production-readiness approval: native mobile now has Capacitor iOS/Android projects but signed store builds and device QA are still pending, privileged admin actions were not exercised with an admin account, and live billing/provider flows were not verified.

## Environment

- API: `API_HOST=127.0.0.1 API_PORT=3001 pnpm --filter @vibecore/api dev`
- Web app: `VITE_DEV_HOST=127.0.0.1 VITE_DEV_PORT=5173 VITE_STRICT_PORT=true pnpm run dev`
- Browser: Playwright Chromium against `http://127.0.0.1:5173`
- Runtime mode observed: local WebContainer for IDE preview; backend API on `http://127.0.0.1:3001`

## Failures Fixed During This Pass

| Failure | Impact | Fix | Verification |
| --- | --- | --- | --- |
| Remix SSR repeatedly threw `TypeError: Invalid state: ReadableStream is locked` during browser runs. | App pages could loop server errors before manual panel validation. | `app/entry.server.tsx` now renders the `remix-island` head with a cloned context that omits `serverHandoffStream`, so the main Remix render owns the single-fetch stream. | `tests/e2e/critical-paths.spec.ts` passes after the fix. |
| Critical preview iframe coverage was missing. | Preview could regress without an automated browser assertion. | Added `tests/e2e/critical-paths.spec.ts`. | Playwright Chromium pass. |
| Backend prompt-to-app and file CRUD critical path coverage was missing. | API generation and runtime file APIs could regress unnoticed. | Added `services/api/src/tests/critical-paths.spec.ts`. | API Vitest pass. |
| Terminal WebSocket critical path coverage was missing. | Terminal transport could regress unnoticed. | Added WebSocket command-output test in `services/workspace-agent/src/app.spec.ts`. | Workspace-agent Vitest pass. |

## Panel Results

`Backend` means the panel either loaded through an authenticated Remix loader backed by the API or issued API/runtime requests observed during the browser smoke.

| Feature / panel | Renders | Backend | Interaction | Evidence / notes |
| --- | --- | --- | --- | --- |
| Dashboard | PASS | PASS | PASS | Rendered authenticated workspace shell; homepage preview API returned 200. |
| Projects list | PASS | PASS | PASS | Rendered project navigation and current project data. |
| New project / AI prompt | PASS | PASS | PASS | Prompt textarea accepted input; prompt-to-app backend path covered by API test. |
| Templates | PASS | PASS | PASS | Template route rendered; existing E2E suite contains template preview flow. |
| Project overview | PASS | PASS | PASS | Authenticated project route loaded created project. |
| Project deployments | PASS | PASS | PASS | Route rendered deployment panel shell. |
| Project environment variables | PASS | PASS | PASS | Route rendered environment panel shell. |
| Project secrets | PASS | PASS | PASS | Route rendered secrets panel shell. |
| Project Git | PASS | PASS | PASS | Route rendered Git panel shell. |
| Project activity | PASS | PASS | PASS | Route rendered activity panel shell. |
| Project logs | PASS | PASS | PASS | Route rendered logs panel shell. |
| Project collaborators | PASS | PASS | PASS | Route rendered collaborators panel shell. |
| Project snapshots | PASS | PASS | PASS | Route rendered snapshots panel shell. |
| Project custom domains | PASS | PASS | PASS | Route implemented as `Custom domains`; browser smoke reached the authenticated shell. |
| Project settings | PASS | PASS | PASS | Route rendered project settings shell. |
| Account settings | PASS | PASS | PASS | Settings route rendered control panel and called configured-provider APIs. |
| Billing | PASS | PASS | PASS | Billing route rendered. Live Stripe checkout/webhook was not exercised. |
| Usage / quotas | PASS | PASS | PASS | Usage route rendered. Backend quota enforcement is covered separately by API/readiness tests. |
| Admin | PASS | PASS | PASS | Non-admin user correctly received 403. Privileged admin mutation flow not manually exercised. |
| Security page | PASS | PASS | PASS | Public security page rendered. |
| Audit logs | PASS | PASS | PASS | Audit route rendered export controls. |
| Connected accounts | PASS | PASS | PASS | Connected accounts route rendered. Provider OAuth was not completed. |
| Desktop settings | PASS | PASS | PASS | Desktop settings route rendered. Electron smoke is command-verified separately. |
| Privacy page | PASS | N/A | PASS | Public legal page rendered. |
| Terms page | PASS | N/A | PASS | Public legal page rendered. |
| IDE shell / agent panel | PASS | PASS | PASS | Workspace reached `running`; agent panel and provider controls rendered. |
| IDE files panel | PASS | PASS | PASS | File tree rendered and file selection worked. Automated file CRUD covers backend mutations. |
| IDE editor | PASS | PASS | PASS | Editor rendered with project files; responsive editor tests cover Monaco/CodeMirror selection. |
| IDE terminal panel | PASS | PASS | PASS | Terminal panel opened via `Terminal` control; backend terminal WebSocket command-output test passes. |
| IDE preview / Webview | PASS | PASS | PASS | Webview opened and iframe rendered imported app content in Playwright. |
| IDE deploy controls | PASS | PASS | PASS | Deploy controls render in IDE shell; live provider deploy was not executed. |
| Desktop app | PASS | PASS | PASS | Electron smoke command is part of verification. |
| iOS app | PASS | PARTIAL | PARTIAL | Capacitor iOS project exists and syncs; signed archive/TestFlight and simulator/device pass still required. |
| Android app | PASS | PARTIAL | PARTIAL | Capacitor Android project exists and syncs; debug build/release signing/emulator QA still required. |

## Automated Critical Path Tests Added

| Critical path | Test file | What it verifies |
| --- | --- | --- |
| Prompt-to-app generation | `services/api/src/tests/critical-paths.spec.ts` | `POST /orgs/:orgId/projects/from-ai` creates a project and persists generated starter files. |
| File CRUD operations | `services/api/src/tests/critical-paths.spec.ts` | Runtime create, read, write, move, and delete endpoints proxy correctly to the runtime manager. |
| Terminal WebSocket | `services/workspace-agent/src/app.spec.ts` | Authenticated terminal WebSocket accepts input and streams command output. |
| Preview iframe loading | `tests/e2e/critical-paths.spec.ts` | Imported app content appears inside `iframe[title="preview"]`. |

## Commands Run

- `pnpm --filter @vibecore/api test -- src/tests/critical-paths.spec.ts`
- `pnpm --filter @vibecore/workspace-agent test`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 API_BASE_URL=http://127.0.0.1:3001 pnpm exec playwright test tests/e2e/critical-paths.spec.ts --project=chromium --workers=1`
- Browser smoke script with Playwright Chromium over dashboard, project pages, IDE agent/files/terminal/webview, legal and settings routes.
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run test`
- `pnpm run build`
- `pnpm run desktop:test`
- `pnpm --filter @vibecore/mobile test` (`echo "mobile app scaffolded"`, not a real mobile validation)
- `git diff --check`

## Remaining Gaps

- Native iOS and Android now have Capacitor projects; final store readiness still requires signed builds and device QA.
- Admin privileged actions need a seeded admin account or admin fixture for real mutation testing.
- Billing was rendered locally, but live Stripe checkout and webhook verification were not executed in this pass.
- Provider deploy/OAuth flows were rendered but not completed against external services.
