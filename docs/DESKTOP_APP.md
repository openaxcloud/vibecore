# VibeCore Desktop App

VibeCore Desktop keeps the Bolt renderer as the application surface and wraps it with Electron-native platform services.

## Preserved Bolt Surface

- The renderer remains the existing Remix/Bolt app.
- Existing Electron scripts remain available:
  - `pnpm electron:dev`
  - `pnpm electron:build:mac`
  - `pnpm electron:build:win`
  - `pnpm electron:build:linux`
  - `pnpm electron:build:dist`
- New desktop aliases call those scripts:
  - `pnpm desktop:dev`
  - `pnpm desktop:build:mac`
  - `pnpm desktop:build:win`
  - `pnpm desktop:build:linux`
  - `pnpm desktop:build:dist`
  - `pnpm desktop:test`

## Native Capabilities

The preload bridge exposes `window.vibecoreDesktop` with a narrow API:

- `auth.get/set/clear`: stores SaaS tokens through Electron `safeStorage` when keychain encryption is available.
- `files.importZip/exportZip/openLocalFolder`: native file/folder dialogs.
- `notifications.show`: native OS notifications.
- `settings.get/set`: desktop proxy, tray, and managed-device policy placeholders.
- `network.status`: desktop connection status hook.
- `crashReporting.status`: crash reporting status when configured.
- `onDeepLink`: receives `vibecore://` links.
- `onMenuAction`: receives native menu actions.

## Deep Links

Registered protocol:

- `vibecore://project/:id`
- `vibecore://workspace/:id`

Both route to the IDE project surface. The app uses a single-instance lock so deep links from a second launch are forwarded to the existing window.

## Desktop Settings

The `/desktop-settings` route exposes desktop-only controls:

- token storage status
- proxy mode placeholder
- tray enable/disable
- native notification test
- local folder import
- enterprise device policy placeholder

## Offline And Enterprise Policy

The app keeps the web renderer's offline states and adds desktop hooks for native network status. Enterprise device policy is intentionally represented as a placeholder object for future MDM/registry/profile integration.

## Crash Reporting

Crash reporting starts only when `DESKTOP_CRASH_REPORT_URL` is configured. This avoids accidental crash upload in local/dev builds.
