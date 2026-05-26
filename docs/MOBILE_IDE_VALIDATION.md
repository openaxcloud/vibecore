# Mobile IDE Validation

This checklist tracks the production mobile IDE surface for Vibecore. The implementation keeps the existing Bolt IDE and adapts its real panels instead of adding standalone mock mobile screens.

## Responsive Rules

- Mobile shell: viewport width below `768px`, or any short landscape viewport below `500px` high.
- Tablet portrait shell: `768px` to `1024px` wide in portrait.
- Tablet landscape and desktop keep the full IDE shell.
- Runtime/workspace status stays in the bottom status bar. On compact shells it sits above the mobile tab bar.

## Real Surfaces

- Chat: existing project agent panel.
- Files: runtime-backed file tree through `workbenchStore.files`.
- Editor: CodeMirror mobile editor through `@vibecore/editor`.
- Terminal: real `TerminalTabs` and runtime panel state.
- Preview: real preview server state through `workbenchStore.previews` and `previewServerState`.
- Deploy/tools: real `ProjectIdeServicePanel`; deep links such as `?panel=database` load the existing authenticated IDE panel API.
- Database: real project env/snapshot APIs. `DATABASE_URL` writes use `/projects/:id/env-vars`; database backups use `/projects/:id/snapshots`.
- Security: real IDE panel API backed by project env state and runtime workspace commands. Scans call `npm audit --json` and a source secret scan through `/api/runtime/workspaces/:workspaceId/commands`.
- Native shell: Capacitor runtime dispatches deep link, push token/action, network and crash events into the embedded web runtime.

## Component Mapping

- `MobileSecurityPanel`: mapped to `ProjectSecurityPanel` inside `BaseChat.tsx`, rendered through `ProjectIdeServicePanel` and `/api/projects/:projectId/ide-panel/security`.
- `MobileDatabasePanel`: mapped to `ProjectDatabasePanel`, including connection, environment, activity and backup tabs.
- `ReplitMobileShell`: mapped to the existing runtime `TerminalTabs` and terminal service panel; mobile routes use the same workspace backend.
- `MobileEditorTabs`: mapped to the bottom `MOBILE_IDE_PANELS` navigation and compact workbench shell.
- `MobileHeader` and `MobileNavigation`: mapped to the project top bar plus compact IDE tab bar/status bar.
- `use-mobile`, `use-mobile-gestures`, persistence hooks: mapped to `@vibecore/editor` responsive layout, `useMobileGestures`, and `useMobileIdePersistence`.

## Validation Commands

- `pnpm exec tsc --noEmit --pretty false`
- `pnpm run lint`
- `pnpm --filter @vibecore/mobile test`
- `pnpm --filter @vibecore/mobile typecheck`
- `pnpm --filter @vibecore/mobile build:web`
- `pnpm run mobile:validate`
- `JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=/opt/homebrew/share/android-commandlinetools ANDROID_SDK_ROOT=/opt/homebrew/share/android-commandlinetools PATH=/opt/homebrew/share/android-commandlinetools/cmdline-tools/latest/bin:/opt/homebrew/share/android-commandlinetools/platform-tools:$PATH pnpm run mobile:build:android`
- `pnpm run platform:no-mocks`
- `pnpm exec vitest run packages/editor/src/index.spec.ts --reporter=dot`
- `pnpm exec playwright test tests/e2e/responsive-ide.spec.ts --project=mobile`
- `pnpm exec playwright test tests/e2e/responsive-ide.spec.ts --project=tablet --project=chromium`
- `pnpm exec playwright test tests/e2e/mobile-device-matrix.spec.ts --project=chromium`
- `pnpm run build`

## Compact Panel Matrix

- `tests/e2e/mobile-device-matrix.spec.ts` now verifies every compact IDE panel on phone and tablet landscape.
- Covered panels: Webview, AI Agent, Files, Editor, Terminal, Search, Locks, Overview, Git, Packages, Database, Object Storage, Secrets, Environment variables, Logs, Debugger, Workflows, Integrations, Collaborators, Activity, Snapshots, Extensions, Monitoring, Domains, Security, Settings and Deployments.
- The matrix asserts no horizontal overflow, no status/tab-bar overlap, full-screen compact panel sizing and a nonblank Webview surface.
- Screenshots are attached per panel/profile to the Playwright report.

## Non-Goals

- Do not copy E-Code/Replit component names, routes, or mock endpoints into Vibecore.
- Do not replace the existing Bolt IDE.
- Do not introduce simulated backend data for mobile-only panels.

## Native Build Notes

- Android debug build requires a local Android SDK. This workspace uses the Homebrew command line tools at `/opt/homebrew/share/android-commandlinetools`.
- Gradle must run on a supported JDK. Use OpenJDK 21 for `mobile:build:android`; the default Java 25 is not compatible with Gradle 8.14.3.
- The validated debug APK is produced at `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`.
