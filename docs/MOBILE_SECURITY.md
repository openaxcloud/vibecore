# Mobile Security

Date: 2026-05-03

## Session Storage

The mobile app does not persist bearer tokens or API secrets in Capacitor Preferences. `SecureSessionStore` stores only lock state:

- `locked`
- `biometricEnabled`
- `lastUnlockedAt`
- `userHint`

Authentication remains server/cookie controlled by the web app and backend.

## Biometric Unlock

Biometric unlock is implemented through platform WebAuthn user verification. It gates local unlock state and does not decrypt or reveal a stored session token. If WebAuthn platform authenticators are unavailable, the app must fall back to normal login.

## Network and Origins

`VITE_WEB_APP_ORIGIN` and `VITE_API_BASE_URL` are environment-driven. Production builds must use HTTPS origins. Development server URLs are allowed only through `VITE_MOBILE_DEV_SERVER_URL`/`MOBILE_DEV_SERVER_URL`.

## Deep Links

Supported inputs:

- `vibecore://...`
- `https://<configured-app-host>/...`

The app parser rejects unsupported protocols. Production universal links/app links require domain ownership files:

- iOS: `apple-app-site-association`
- Android: `.well-known/assetlinks.json`

Repository assets live in `apps/mobile/assets/apple-app-site-association` and `apps/mobile/assets/assetlinks.json`. `pnpm mobile:validate` verifies that the files exist and are structurally valid. `pnpm mobile:validate:release` additionally rejects `app.example.com`, empty Apple app IDs, and empty/invalid Android release SHA-256 fingerprints; release owners must still publish the files from the production hosts.

## Push Notifications

Push registration tokens must be sent to the API over authenticated HTTPS and associated with the current user/org on the server. Tokens are not secrets but should still be treated as account-linked identifiers.

## File Handling

File imports use Capacitor Filesystem and browser file input flows. Uploads go through authenticated API requests. The API must still enforce project RBAC, file size limits, content scanning policy, and path traversal protections.

## Crash Reporting

`configureCrashReporting` captures browser error events and forwards them to a caller-provided reporting adapter. Production wiring should redact URLs, file names, project content, tokens, cookies, and user-entered prompts before sending to any third-party crash service.

## Enterprise MDM

`apps/mobile/assets/mdm-config.example.json` documents managed keys. MDM config may define allowed domains and feature flags but must not contain raw user credentials, API secrets, or signing keys.
