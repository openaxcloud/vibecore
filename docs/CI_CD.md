# CI/CD

The production CI/CD system is implemented in GitHub Actions.

## Workflows

- `.github/workflows/ci.yml`: install, lint, typecheck, unit tests, integration tests, web build, admin build, service builds, Prisma validation and security checks.
- `.github/workflows/e2e.yml`: local PostgreSQL/Redis/Mailpit stack, API, web app, Playwright desktop and mobile viewport tests.
- `.github/workflows/docker.yml`: builds production images, pushes to Google Artifact Registry, generates SBOMs and runs vulnerability scans.
- `.github/workflows/terraform.yml`: Terraform fmt, validate, staging plan and production plan.
- `.github/workflows/deploy-staging.yml`: installs Node/pnpm dependencies, deploys staging, and runs smoke checks.
- `.github/workflows/staging-runtime-validation.yml`: manually validates remote Kubernetes RuntimeAdapter and workspace NetworkPolicies against the staging workspace cluster.
- `.github/workflows/deploy-prod.yml`: production environment approval, installs Node/pnpm dependencies, verifies a fresh successful `Staging Runtime Validation` run id, validates production config, production deploy, smoke checks and rollback instructions.
- `.github/workflows/desktop-release.yml`: macOS, Windows and Linux desktop artifacts with signing secret placeholders.
- `.github/workflows/mobile-release.yml`: Android debug APK build via Gradle and iOS macOS Capacitor sync/signing-doc artifact.

## Required GitHub Variables

- `GCP_PROJECT_ID`
- `GCP_REGION`
- `GAR_LOCATION`
- `GAR_REPOSITORY`
- `STAGING_APP_CLUSTER`
- `STAGING_WORKSPACE_CLUSTER`
- `STAGING_APP_DOMAIN`
- `STAGING_PREVIEW_DOMAIN`
- `PROD_APP_CLUSTER`
- `PROD_APP_DOMAIN`
- `PROD_PREVIEW_DOMAIN`
- Runtime, OAuth, OIDC, SAML, SMTP/email, Stripe catalog, deployment provider,
  observability, security contact, retention and SOC2 evidence variables listed
  in `.env.production.example`.

## Required GitHub Secrets

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_TERRAFORM_SERVICE_ACCOUNT`
- `GCP_ARTIFACT_WRITER_SERVICE_ACCOUNT`
- `GCP_DEPLOY_SERVICE_ACCOUNT`
- `RUNTIME_E2E_API_TOKEN`
- `RUNTIME_E2E_AGENT_SECRET`
- Runtime, OAuth, OIDC, SAML, SMTP/email, Stripe, deployment provider, SIEM,
  incident response, backup and core application secrets listed in
  `.env.production.example`.
- desktop signing placeholders documented in `docs/DESKTOP_RELEASE.md`

## Production Runtime Gate

Before running `Deploy Production`, run `Staging Runtime Validation` with a
pullable workspace-agent image, `runtime_class=gvisor`, and the exact staging
Cloud SQL/Redis/private IP list. Copy the successful workflow run id into the
`staging_runtime_run_id` input of `Deploy Production`.

`deploy-prod.yml` rejects production deploys if the referenced run is not the
`Staging Runtime Validation` workflow, was not manually dispatched, did not
finish with `success`, or is older than 72 hours.

After the staging runtime gate, `deploy-prod.yml` runs
`pnpm run production:validate` with the production GitHub Environment
vars/secrets. This happens before GCP authentication and before any Helm
operation, so missing secrets or unsafe production config block the deploy
without touching the cluster.

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

`pnpm run cicd:validate` parses every GitHub Actions workflow as YAML and
asserts least-privilege permissions for deploy/runtime workflows. Deploy and
runtime validation workflows must keep `contents: read`, required
`id-token: write`, and must not request `contents: write`.

## Immutable action references

External GitHub Actions are pinned to immutable 40-character commit SHAs; the
reviewed release remains in an inline comment for maintainability. The strict
TypeScript regression gate is `scripts/validate-github-actions-pinned.ts`; it
parses the YAML AST and recursively scans every reachable local composite
action or reusable workflow, including actions stored outside `.github`.
Container actions declared as `docker://...` must use an immutable `sha256`
image digest, including remote images declared in reachable local Docker action
metadata; only the repository's checked-in `Dockerfile` is exempt. Job
containers and service containers are held to the same rule; mutable image tags
and implicit `latest` references fail the gate. Dynamic
expressions, merge keys, non-literal mapping keys and YAML aliases
in `uses:` are rejected fail-closed because their executed trust identity cannot
be proven statically. Invalid, duplicate-key, oversized and symlinked YAML is
also rejected.
Local references are resolved from the repository root; missing or ambiguous
descriptors, traversal, symlinks and dependency cycles fail closed.
Even a full SHA is rejected when the external action owner is outside the
reviewed trust policy embedded in the validator; onboarding another owner is a
security-policy change covered by CODEOWNERS.

CI executes the committed standalone bundle immediately after checkout, before
Node/pnpm setup and before dependency installation. After the frozen install it
strict-typechecks the source, runs the hostile Vitest matrix and embedded
self-test, then rebuilds the source plus YAML parser and compares the result
byte-for-byte with the bootstrap bundle. A stale or hand-edited bundle fails CI.

Twenty-four exact references are temporarily locked as structural exceptions:
fifteen in `e2e.yml`, `electron.yml` and `terraform.yml` while Claude PR #352
owns those files, plus five in the legacy Cloudflare preview workflow pending
explicit approval of its external deployment boundary, and four in the
privileged stable-release workflow pending explicit approval of its automated
tag/release/force-push boundary. The allowlist fixes the file, exact YAML path,
action and mutable ref. Moving or copying an exempt action therefore creates a
blocked finding while the original exception becomes stale. A SHA-256 of the
entire workflow context also invalidates an exception whenever permissions,
events, environment, conditions, inputs or secrets change. Every record names
an owner, a verifiable PR and an expiry no more than 30 days after creation.
Dates are real-calendar validated, an exception cannot activate before its
`createdOn` date, and only one authorization may occupy a workflow location.
Strict validation remains red until all blockers are removed and every
reference is pinned.

```bash
pnpm exec tsc --project tsconfig.actions-validator.json --noEmit
pnpm exec vitest run scripts/validate-github-actions-pinned.spec.ts
node --import tsx scripts/validate-github-actions-pinned.ts --self-test
node --import tsx scripts/validate-github-actions-pinned.ts --allow-temporary-exceptions
node --import tsx scripts/build-github-actions-validator.ts --check
# Expected to fail only on the 24 explicitly recorded temporary references:
node --import tsx scripts/validate-github-actions-pinned.ts
```
