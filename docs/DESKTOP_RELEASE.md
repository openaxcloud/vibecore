# Desktop Release

## Build Commands

```bash
pnpm desktop:test
pnpm desktop:build:mac
pnpm desktop:build:win
pnpm desktop:build:linux
pnpm desktop:build:dist
```

`desktop:test` builds the Electron main/preload bundles and runs a smoke test for the preload bridge, deep-link hooks, builder config, and native service markers.

## GitHub Actions

`.github/workflows/electron.yml` builds macOS, Windows, and Linux in a matrix and uploads artifacts. Manual and tag workflows create a draft release.

Signing secret placeholders:

- `DESKTOP_CSC_LINK`
- `DESKTOP_CSC_KEY_PASSWORD`
- `DESKTOP_APPLE_ID`
- `DESKTOP_APPLE_APP_SPECIFIC_PASSWORD`
- `DESKTOP_APPLE_TEAM_ID`
- `DESKTOP_WIN_CSC_LINK`
- `DESKTOP_WIN_CSC_KEY_PASSWORD`

## macOS Signing And Notarization

For production macOS releases:

1. Create a Developer ID Application certificate.
2. Export the certificate as base64 `.p12` and set `DESKTOP_CSC_LINK`.
3. Set `DESKTOP_CSC_KEY_PASSWORD`.
4. Configure Apple notarization credentials:
   - `DESKTOP_APPLE_ID`
   - `DESKTOP_APPLE_APP_SPECIFIC_PASSWORD`
   - `DESKTOP_APPLE_TEAM_ID`
5. Keep hardened runtime enabled in `electron-builder.yml`.

## Windows Signing

For production Windows releases:

1. Use an OV/EV code signing certificate.
2. Export a signing certificate compatible with electron-builder.
3. Set `DESKTOP_WIN_CSC_LINK`.
4. Set `DESKTOP_WIN_CSC_KEY_PASSWORD`.
5. Verify the NSIS installer signature after build.

## Linux Artifacts

Linux targets are:

- AppImage
- deb

The CI installs packaging dependencies before running `pnpm desktop:build:linux`.

## Auto-Update

The app keeps the existing `electron-updater` architecture. Update metadata comes from `electron-update.yml` and GitHub releases. Auto-download is disabled; users are prompted before downloading and before restart.
