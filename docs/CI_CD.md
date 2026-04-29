# CI/CD

The production CI/CD system is implemented in GitHub Actions.

## Workflows

- `.github/workflows/ci.yml`: install, lint, typecheck, unit tests, integration tests, web build, admin build, service builds, Prisma validation and security checks.
- `.github/workflows/e2e.yml`: local PostgreSQL/Redis/Mailpit stack, API, web app, Playwright desktop and mobile viewport tests.
- `.github/workflows/docker.yml`: builds production images, pushes to Google Artifact Registry, generates SBOMs and runs vulnerability scans.
- `.github/workflows/terraform.yml`: Terraform fmt, validate, staging plan and production plan.
- `.github/workflows/deploy-staging.yml`: deploys staging and runs smoke checks.
- `.github/workflows/deploy-prod.yml`: production environment approval, production deploy, smoke checks and rollback instructions.
- `.github/workflows/desktop-release.yml`: macOS, Windows and Linux desktop artifacts with signing secret placeholders.
- `.github/workflows/mobile-release.yml`: Android artifact placeholder and iOS macOS runner requirements.

## Required GitHub Variables

- `GCP_PROJECT_ID`
- `GCP_REGION`
- `GAR_LOCATION`
- `GAR_REPOSITORY`
- `STAGING_APP_CLUSTER`
- `STAGING_APP_DOMAIN`
- `STAGING_PREVIEW_DOMAIN`
- `PROD_APP_CLUSTER`
- `PROD_APP_DOMAIN`
- `PROD_PREVIEW_DOMAIN`

## Required GitHub Secrets

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_TERRAFORM_SERVICE_ACCOUNT`
- `GCP_ARTIFACT_WRITER_SERVICE_ACCOUNT`
- `GCP_DEPLOY_SERVICE_ACCOUNT`
- desktop signing placeholders documented in `docs/DESKTOP_RELEASE.md`

## Local Validation

```bash
pnpm install
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm infra:validate
node scripts/validate-ci-cd-assets.mjs
ruby -e 'require "yaml"; Dir[".github/workflows/*.{yml,yaml}"].each { |f| YAML.load_file(f); puts f }'
```
