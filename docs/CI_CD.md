# CI/CD

The production CI/CD system is implemented in GitHub Actions.

## Workflows

- `.github/workflows/ci.yml`: install, lint, typecheck, unit tests, integration tests, web build, admin build, service builds, Prisma validation and security checks.
- `.github/workflows/e2e.yml`: local PostgreSQL/Redis/Mailpit stack, API, web app, Playwright desktop and mobile viewport tests.
- `.github/workflows/docker.yml`: builds production images, pushes to Google Artifact Registry, generates SBOMs and runs vulnerability scans.
- `.github/workflows/terraform.yml`: Terraform fmt, validate, staging plan and production plan.
- `.github/workflows/deploy-staging.yml`: accepts only `sha-<7 lowercase hex>` image tags, rejects production cluster/domains, resolves every tag to one GAR digest, deploys those digests, and runs smoke checks. A credential-free job first proves the workflow graph came from `main`.
- `.github/workflows/staging-runtime-validation.yml`: manually validates remote Kubernetes RuntimeAdapter and workspace NetworkPolicies against the staging workspace cluster.
- `.github/workflows/deploy-main.yml`: the only normal production path. It binds the run to a full commit SHA already on `main`, waits for the required workflows for that exact SHA, validates protected production configuration before WIF, builds affected tiers, verifies signed digests/SBOMs, deploys by digest and checks live Kubernetes imageIDs.
- `.github/workflows/deploy-break-glass.yml`: two-person, two-environment emergency rollback of a previously signed release manifest. It pins the graph and both checkouts to the exact workflow SHA from `main` and cannot build new code.
- `.github/workflows/release-gate-dryrun.yml`: read-only exact-SHA gate diagnostic; it cannot obtain cloud credentials or deploy.
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
- `WORKSPACE_AGENT_IMAGE`
- `PREVIEW_URL_TEMPLATE`
- `RESERVED_VM_RUNTIME_ENABLED`
- `RESERVED_VM_PAYLOAD_ENCRYPTION_KEY_ID` when the reserved-VM runtime is enabled
- `OAUTH_GITHUB_CLIENT_ID`, `OAUTH_GITHUB_REDIRECT_URI`, `OAUTH_GITHUB_TOKEN_URL`, `OAUTH_GITHUB_USERINFO_URL`
- `DEPLOY_GITHUB_PAGES_REPO` and `DEPLOY_GITHUB_PAGES_WORKFLOW` when the GitHub Pages provider is enabled
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
- `PREVIEW_PROXY_SHARED_SECRET`
- `RESERVED_VM_PAYLOAD_ENCRYPTION_KEY` and `RESERVED_VM_PAYLOAD_DECRYPTION_KEYS_JSON` when the reserved-VM runtime is enabled
- Runtime, OAuth, OIDC, SAML, SMTP/email, Stripe, deployment provider, SIEM,
  incident response, backup and core application secrets listed in
  `.env.production.example`.
- desktop signing placeholders documented in `docs/DESKTOP_RELEASE.md`

## Production Release Gate

`deploy-main.yml` accepts only a full 40-hex `target_sha` that is an ancestor of
`origin/main`; a push uses its exact event SHA. The workflow file itself must be
loaded from `refs/heads/main`. The release gate then requires successful
`Production CI`, `Production E2E`, `Security Analysis` and `Code Quality` runs
whose numeric workflow IDs, paths, branch, event and `head_sha` all match the
target. A successful staging run or a green neighbouring commit cannot authorise
production.

The protected production variables and secrets are validated with
`validate-production-enterprise.mjs --strict --no-dotenv` before the first WIF
exchange. Third-party Actions in the release workflows are pinned to immutable
40-hex commits, and dispatch inputs enter scripts only through environment
variables. Repository variables and step outputs likewise never enter `run:`
source directly. Downloaded gitleaks and cosign executables are checked against
fixed SHA-256 values before extraction or installation.

Manual staging dispatches must also use the graph loaded from `main`. The graph
guard has no environment or OIDC permission; only after it succeeds does the
deploy job validate the exact image tag, cluster, project, region and both
domains. Google authentication is the next credential-bearing step. Each chart
image and the workspace-agent tag must then resolve to exactly one valid GAR
digest; absent, malformed or ambiguous resolutions fail before Helm, which
consumes only those digests and the validated non-image outputs.

The former `.github/workflows/deploy-prod.yml` is intentionally forbidden by
`pnpm run cicd:validate`: it accepted a separate mutable-tag path, could race the
continuous deployment and was not bound to the target SHA's required checks.

## Local Validation

```bash
pnpm install
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm infra:validate
node scripts/validate-ci-cd-assets.mjs
node scripts/release-gate/validate-deploy-gate-wired.mjs --self-test
actionlint -no-color .github/workflows/deploy-main.yml .github/workflows/deploy-break-glass.yml .github/workflows/release-gate-dryrun.yml .github/workflows/deploy-staging.yml
ruby -e 'require "yaml"; Dir[".github/workflows/*.{yml,yaml}"].each { |f| YAML.load_file(f); puts f }'
```

`pnpm run cicd:validate` parses every GitHub Actions workflow as YAML and
asserts least-privilege permissions and the exact-SHA/digest gate wiring.
`id-token: write` is job-local to the production build/deploy job; resolve,
release-gate and preflight jobs cannot exchange a cloud credential.
