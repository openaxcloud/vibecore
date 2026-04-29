# Release Process

## Staging

1. Merge to `stable`.
2. Wait for `Production CI`, `Production E2E`, `Production Docker` and `Production Terraform`.
3. `Deploy Staging` runs automatically on `stable` or manually with an image tag.
4. Confirm smoke checks and synthetic health.

## Production

1. Create an immutable image tag from a known-good commit.
2. Review Terraform plan for production.
3. Open `Deploy Production` manually.
4. Enter the immutable image tag.
5. Type `READY` after reviewing `docs/ROLLBACK.md`.
6. Approve the GitHub `production` environment gate.
7. Confirm smoke checks and dashboards.

## Desktop

Run `Desktop Release` from a tag. Signing secrets are placeholders until the platform owner configures Apple and Windows signing credentials.

## Mobile

Android and iOS release workflows publish artifacts and documentation placeholders. iOS requires a macOS runner, Apple certificates, provisioning profiles and App Store Connect API credentials.
