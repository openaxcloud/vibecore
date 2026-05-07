# Mobile Apps

Date: 2026-05-03

Vibecore mobile is a Capacitor-based native shell in `apps/mobile/` that reuses the responsive web product through a configured web origin and adds native app capabilities. It is not a Monaco-on-phone wrapper: the web IDE uses `@vibecore/editor`, where phones and portrait tablets resolve to `MobileCodeEditor` / CodeMirror and only desktop or landscape tablets resolve to Monaco.

## Architecture

- Native shell: `apps/mobile/src/main.ts`, built by Vite into `apps/mobile/dist`.
- Native projects: `apps/mobile/ios/` and `apps/mobile/android/`.
- Capacitor config: `apps/mobile/capacitor.config.ts`.
- Runtime config is environment-driven. Do not hardcode API or app URLs.
- Production app content should set `VITE_WEB_APP_ORIGIN` to the deployed Vibecore web app and `VITE_API_BASE_URL` to the API origin.
- Release association assets are checked in at `apps/mobile/assets/apple-app-site-association` and `apps/mobile/assets/assetlinks.json`; production release must publish them at the iOS associated-domain host and Android App Link host.

## Native Capabilities

- Secure session lock state: `SecureSessionStore` stores only non-secret lock state in Capacitor Preferences. Auth secrets remain server/cookie controlled.
- Biometric unlock: WebAuthn platform user verification adapter for biometric-gated unlock without local secret storage.
- Push notifications: Capacitor Push Notifications registration and action callbacks.
- Deep links: `vibecore://...`, iOS URL scheme, Android intent filter.
- Universal links and Android App Links: native project manifests include associated-domain/app-link configuration, and `pnpm mobile:validate` prevents missing native declarations or association assets.
- Share project link: Capacitor Share.
- File import/upload: Capacitor Filesystem read adapter plus project upload helper.
- Native splash/status bar/keyboard/safe area: Capacitor plugins + CSS `env(safe-area-inset-*)`.
- Offline state: browser online/offline adapter with visible banner.
- Crash/error reporting adapter: captures `window.error` and `unhandledrejection`; wire `onCrashReport` to Sentry or the production telemetry sink.
- Version/build display: Capacitor App info surfaced in the mobile footer.
- Enterprise MDM: supported config keys documented in `apps/mobile/assets/mdm-config.example.json`.

## UX Coverage

The mobile shell exposes navigation into login, onboarding, dashboard, projects, IDE, notifications, and settings. The loaded web app owns the detailed product workflows: project IDE, chat, file tree, mobile editor, terminal, preview, deployment logs, account/org settings.

Tablet landscape uses a split shell layout with persistent side navigation and the web IDE occupying the larger panel. The web IDE keeps its own tablet-landscape full IDE behavior and may use Monaco only when the editor adapter reports support.

## Commands

- `pnpm mobile:dev`
- `pnpm mobile:build:web`
- `pnpm mobile:sync`
- `pnpm mobile:open:ios`
- `pnpm mobile:open:android`
- `pnpm mobile:build:android`
- `pnpm mobile:build:android:release`
- `pnpm mobile:build:ios:docs`
- `pnpm mobile:validate`
- `pnpm mobile:validate:release`
- `pnpm mobile:release-assets`
- `pnpm mobile:release-assets:check`

## Verification

Local checks:

- `pnpm --filter @vibecore/mobile typecheck`
- `pnpm --filter @vibecore/mobile test`
- `pnpm mobile:build:web`
- `pnpm mobile:sync`
- `pnpm mobile:validate`
- `pnpm mobile:build:android` when Android SDK/JDK are available.
- `pnpm mobile:validate:release` before any store/TestFlight candidate; it is expected to fail until production app-link hosts, Apple app IDs, and Android release certificate fingerprints are configured. For local/CI dry-runs, provide the release asset variables in the environment to validate the real values without writing generated files.
- `pnpm mobile:release-assets:check` validates the release asset environment without writing files.

CI:

- `.github/workflows/mobile-release.yml` builds an Android debug APK.
- `mobile-v*` tags require `pnpm mobile:validate:release`, decode the Android release keystore from GitHub Secrets, and build a signed Android release bundle.
- `mobile-v*` tags also run `pnpm mobile:release-assets` from GitHub repository variables before strict release validation.
- The iOS job runs Capacitor iOS sync on macOS and emits signing/build instructions.

Required release asset variables:

- `MOBILE_APP_LINK_HOST`
- `MOBILE_IOS_ASSOCIATED_DOMAIN_HOST` (optional; defaults to `MOBILE_APP_LINK_HOST`)
- `MOBILE_IOS_APP_IDS`
- `MOBILE_ANDROID_PACKAGE_NAME`
- `MOBILE_ANDROID_SHA256_CERT_FINGERPRINTS`
