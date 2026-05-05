# Android Release

Date: 2026-05-03

Android uses the Capacitor/Gradle project in `apps/mobile/android/`.

## Required Inputs

- `VITE_WEB_APP_ORIGIN`
- `VITE_API_BASE_URL`
- Android application id
- Release keystore stored in CI secrets
- Play Console service account JSON
- Android App Link host and Digital Asset Links JSON
- Firebase/FCM configuration for push notifications

Run `pnpm mobile:validate` during development. Run `pnpm mobile:validate:release` before every release candidate. Release validation verifies the Android manifest, native app-link/deep-link declarations, Capacitor dependencies, mobile tests, docs, production app-link host, and non-empty release SHA-256 fingerprints in `apps/mobile/assets/assetlinks.json`.

Generate release assets from CI/local environment with:

```bash
pnpm mobile:release-assets
```

Check the same environment without writing files:

```bash
pnpm mobile:release-assets:check
```

## Local Debug Build

```bash
pnpm mobile:build:android
```

This runs the mobile Vite build, Capacitor Android sync, and Gradle `assembleDebug`.

## Release Build Flow

1. Validate native assets: `pnpm mobile:validate:release`.
2. Build and sync: `pnpm --filter @vibecore/mobile sync:android`.
3. Configure release signing through Gradle properties or CI secrets.
4. Build release bundle: `cd apps/mobile/android && ./gradlew bundleRelease`.
5. Upload `.aab` to Play Console internal testing first.
6. Promote only after device QA and production API/origin checks pass.

## App Links

`AndroidManifest.xml` includes a verified HTTPS App Link intent filter. Configure `@string/app_link_host` per environment and host:

```text
https://<host>/.well-known/assetlinks.json
```

Serve `apps/mobile/assets/assetlinks.json` from that path. The JSON must include the production package name and release SHA-256 signing certificate fingerprint, not the debug fingerprint.

## Signing Environment

Release builds fail unless all variables are present:

- `VIBECORE_ANDROID_KEYSTORE_PATH`
- `VIBECORE_ANDROID_KEYSTORE_PASSWORD`
- `VIBECORE_ANDROID_KEY_ALIAS`
- `VIBECORE_ANDROID_KEY_PASSWORD`
- `MOBILE_APP_LINK_HOST`
- `MOBILE_ANDROID_PACKAGE_NAME`
- `MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS`

The GitHub mobile release workflow expects `VIBECORE_ANDROID_KEYSTORE_BASE64` plus the password/alias secrets and uploads the signed `.aab` artifact for `mobile-v*` tags.

## Play Store Checklist

- Data safety form matches Vibecore telemetry, auth, project, and file practices.
- Push notification declaration reviewed.
- File/media permission usage reviewed.
- Internal testing validates login, dashboard, project IDE, mobile editor save, terminal, preview, deployment logs, notifications, settings, deep link, share sheet, upload, offline banner.
