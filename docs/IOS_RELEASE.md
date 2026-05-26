# iOS Release

Date: 2026-05-03

iOS uses the Capacitor project in `apps/mobile/ios/`. Final signed builds require macOS, Xcode, Apple signing certificates, provisioning profiles, and App Store Connect API credentials.

## Required Inputs

- `VITE_WEB_APP_ORIGIN`
- `VITE_API_BASE_URL`
- Apple Team ID
- App Store Connect issuer/key ID/private key
- Distribution certificate
- App Store provisioning profile for `app.vibecore.mobile` or the configured bundle id
- Associated domain entitlement for the production web host
- Push notification entitlement and APNs configuration

Run `pnpm mobile:validate` during development. Run `pnpm mobile:validate:release` before every release candidate. Release validation verifies Capacitor dependencies, iOS URL scheme, Face ID/photo usage descriptions, associated-domain entitlements, production associated-domain host, mobile tests, docs, and non-empty Apple app IDs in `apps/mobile/assets/apple-app-site-association`.

Generate release assets from CI/local environment with:

```bash
pnpm mobile:release-assets
```

Check the same environment without writing files:

```bash
pnpm mobile:release-assets:check
```

`pnpm mobile:validate:release` also accepts the same release asset environment variables and validates those values in memory. Use this for CI gates that must verify real production values before deciding whether to write generated association files.

## Build Flow

1. Install dependencies: `pnpm install --frozen-lockfile`.
2. Build mobile shell: `pnpm mobile:build:web`.
3. Validate native assets: `pnpm mobile:validate:release`.
4. Sync iOS: `pnpm --filter @vibecore/mobile sync:ios`.
5. Open Xcode: `pnpm mobile:open:ios`.
6. Verify bundle id, signing team, associated domains, APNs environment, version, and build number.
7. Archive the `App` scheme from `apps/mobile/ios/App/App.xcworkspace`.
8. Upload through Xcode Organizer or `xcodebuild` + App Store Connect API.

## Current Automation

The CI iOS job runs a macOS Capacitor sync check and creates `apps/mobile/mobile-artifacts/ios-build-readme.md`. It does not produce a signed IPA because signing credentials are environment-specific and must not be committed.

Publish `apps/mobile/assets/apple-app-site-association` from the associated-domain host over HTTPS with no redirect and `application/json` content type. `pnpm mobile:release-assets` also mirrors the same file to `public/.well-known/apple-app-site-association` for the web app host. Populate the `appIDs` array with the Apple Team ID and bundle id before TestFlight validation.

Required release asset variables:

- `MOBILE_APP_LINK_HOST`
- `MOBILE_IOS_ASSOCIATED_DOMAIN_HOST` (optional; defaults to `MOBILE_APP_LINK_HOST`)
- `MOBILE_IOS_APP_IDS`
- `MOBILE_IOS_APS_ENVIRONMENT`

## Store Checklist

- Privacy nutrition labels match Vibecore data practices.
- Camera/photo/file usage strings are reviewed.
- Push notification purpose is disclosed.
- Universal link domain hosts `apple-app-site-association`.
- TestFlight smoke: login, dashboard, project IDE, mobile editor save, terminal, preview, deployment logs, notifications, settings, deep link open, share sheet, offline banner.
