# Release Process

## Staging

1. Merge to `stable`.
2. Wait for `Production CI`, `Production E2E`, `Production Docker` and `Production Terraform`.
3. `Deploy Staging` runs automatically on `stable` or manually from `main` with the exact published `sha-<7 lowercase hex>` image tag. `latest` and arbitrary tags are rejected; the workflow resolves all service and workspace-agent tags to unique GAR digests before Helm.
4. Confirm smoke checks and synthetic health.

## Production

1. Select the full 40-hex SHA of a commit already on `main` (or use the SHA of a push to `main`).
2. Confirm the required CI, E2E, Security and Quality workflows are running for that exact SHA.
3. For a manual release, dispatch `Deploy Production (Continuous)` from `main` with `target_sha`; never supply an image tag.
4. Approve the GitHub `production` environment gate.
5. The workflow validates protected configuration before WIF, builds only affected signed tiers, resolves every service to a digest and emits a release manifest plus SBOMs.
6. Confirm the Helm rollout, live imageID proof, synthetic checks and dashboards.

Do not recreate `deploy-prod.yml` or run a tag-based production upgrade. Emergency
rollback uses `Deploy Production Break Glass` with the run ID of a previously
signed manifest and two distinct approvers; it cannot build new images.
Dispatch it only from `main`: the workflow refuses any other graph, checks out
the exact trusted workflow SHA and checksum-verifies cosign before using it.

## Desktop

Run `Desktop Release` from a tag. Signing secrets are placeholders until the platform owner configures Apple and Windows signing credentials.

## Mobile

Android and iOS release workflows publish artifacts and documentation placeholders. iOS requires a macOS runner, Apple certificates, provisioning profiles and App Store Connect API credentials.
