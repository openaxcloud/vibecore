# Operator Quickstart

This is the **exact command sequence** to take VibeCore from a freshly cloned
repo to a production deploy. Each step is committable and verifiable. Stop at
the first failure and fix the root cause before continuing.

For background, see `GO_LIVE_CHECKLIST.md`, `GCP_DEPLOYMENT.md`, `GCP_RUNBOOK.md`,
and `PRODUCTION_READINESS.md`. This file is the linear path through them.

---

## Step 1 - Local sanity (10 min)

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm platform:no-mocks
pnpm test
pnpm build
pnpm sre:validate
pnpm cicd:validate
pnpm readiness:validate
```

All eight gates must exit 0. If anything fails, do not move to Step 2 - fix it.

Acceptance: every command above prints success and `pnpm test` reports
`Test Files  18 passed`.

---

## Step 2 - Generate the random secrets (2 min)

```bash
pnpm secrets:generate >> /tmp/vibecore-secrets.txt
```

Open `/tmp/vibecore-secrets.txt` and copy each line into the matching variable
in `.env.production`:

- `JWT_SECRET`
- `COOKIE_SECRET`
- `CONFIG_ENCRYPTION_KEY`
- `WORKSPACE_AGENT_TOKEN_SECRET`
- `BACKUP_ENCRYPTION_KEY`
- `SIEM_SIGNING_SECRET`

These are 32-64 byte hex strings produced by `node:crypto.randomBytes`. Never
commit them.

Acceptance: `cat .env.production | grep -E '^(JWT|COOKIE|CONFIG|WORKSPACE_AGENT|BACKUP|SIEM)_'`
shows six non-empty values.

---

## Step 3 - Provision external providers (2-3 h, manual)

Each row below tells you what to create externally and which `.env.production`
keys to fill. Stop after each row and verify the keys are pasted before moving
to the next.

| Provider | What to create | Env keys to fill |
|---|---|---|
| Postgres | Cloud SQL instance, private IP, SSL required | `DATABASE_URL` |
| Redis | Memorystore instance, private IP, TLS | `REDIS_URL` |
| Stripe | Live API keys + webhook endpoint at `/api/billing/webhook` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Google OAuth | OAuth client at `console.cloud.google.com/apis/credentials` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` |
| GitHub OAuth | OAuth app at `github.com/settings/developers` | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_REDIRECT_URI` |
| Microsoft Entra | Tenant + app registration | `OIDC_*` (8 keys; copy from `/.well-known/openid-configuration`) |
| SAML IdP (optional) | App with ACS URL `${DOMAIN}/auth/saml/{ORG_ID}/acs` | `SAML_ENTITY_ID`, `SAML_ACS_URL`, plus EITHER `SAML_SSO_URL`+`SAML_X509_CERTIFICATE` OR `SAML_METADATA_URL` |
| Email | SendGrid / Postmark / SES | EITHER full `SMTP_*` set OR `EMAIL_HTTP_ENDPOINT`+`EMAIL_HTTP_TOKEN`+`EMAIL_FROM` |
| OTel collector | OTLP HTTP endpoint | `OTEL_EXPORTER_OTLP_ENDPOINT` |
| SIEM | Webhook URL accepting signed JSON | `SIEM_WEBHOOK_URL` |
| Incident webhook | Slack / PagerDuty webhook | `INCIDENT_WEBHOOK_URL` |
| AI provider | At least one of OpenAI / Anthropic / Gemini / etc | `OPENAI_API_KEY` (or another provider key) |
| Deploy providers | Selected beta/prod deploy targets | `DEPLOYMENT_PROVIDERS_ENABLED`; for non-static providers also set the matching dispatch hook/token env (`VERCEL_DEPLOY_HOOK_URL`, `NETLIFY_BUILD_HOOK_URL`, `CLOUDFLARE_DEPLOY_HOOK_URL`, `GITHUB_*`, `CLOUD_RUN_*`, `DOCKER_*`) |

Acceptance: `pnpm production:validate --strict` exits 0 and prints `OK` for
every gate group.

---

## Step 4 - Seed the Stripe catalog (5 min)

Once `STRIPE_SECRET_KEY` is set in `.env.production`:

```bash
# Test mode first
STRIPE_SECRET_KEY=sk_test_... pnpm stripe:seed >> /tmp/vibecore-stripe-test.env

# Live mode
STRIPE_SECRET_KEY=sk_live_... pnpm stripe:seed >> /tmp/vibecore-stripe-live.env
```

Each invocation creates one Product + one recurring monthly Price per plan
(free / pro / team / enterprise) and prints lines like:

```
STRIPE_FREE_PRODUCT_ID=prod_...
STRIPE_FREE_PRICE_ID=price_...
```

Re-running the script is safe: it reuses existing entities matched by
`metadata.planKey`. Paste the eight `STRIPE_*_PRODUCT_ID` / `STRIPE_*_PRICE_ID`
lines into `.env.production`.

Acceptance: `pnpm production:validate --strict` no longer flags
`stripe-catalog` and prints `OK Stripe catalog`.

---

## Step 5 - Live readiness gate (5 min)

```bash
pnpm production:validate:live --strict
```

This re-runs the static checks plus connectivity probes:

- OIDC issuer responds at `/.well-known/openid-configuration`
- SAML metadata URL returns 200 (if configured)
- SMTP login succeeds (if configured)
- SIEM webhook returns 2xx on a probe event
- Google / GitHub OAuth authorize endpoint reachable

Acceptance: every group prints `OK`. If `OIDC` or `SAML` is configured but
unreachable, the gate fails and you must fix it before proceeding.

---

## Step 6 - Provision GKE / staging infra (½ day)

Prerequisites: install `terraform` (`brew install terraform`) and authenticate
with `gcloud auth application-default login`.

```bash
cd infra/terraform/envs/staging
terraform init
terraform validate
terraform plan -out=plan.out
terraform apply plan.out
cd ../../../..

# Cluster credentials
gcloud container clusters get-credentials vibecore-staging-app --region=us-central1
gcloud container clusters get-credentials vibecore-staging-workspaces --region=us-central1

# Helm install
helm install platform infra/helm/platform \
  -n vibecore --create-namespace \
  -f infra/helm/platform/values.staging.yaml

helm install workspaces-runtime infra/helm/workspaces-runtime \
  -n workspaces --create-namespace \
  -f infra/helm/workspaces-runtime/values.staging.yaml

# Verify the security primitives
kubectl get runtimeclass gvisor -n workspaces
kubectl get networkpolicies -n workspaces
RUNTIME_E2E_RUNTIME_CLASS=gvisor pnpm runtime:validate:remote-kubernetes
pnpm runtime:validate:api-kubernetes
```

Acceptance: every kubectl/pnpm command exits 0, the remote-runtime drill pod
runs with `runtimeClassName: gvisor` plus CPU/memory limits, and the
runtime-validate scripts print a session that reaches `RUNNING` status.

For GitHub Actions staging validation, run `Staging Runtime Validation` with:

- `workspace_agent_image`: a pullable Artifact Registry workspace-agent image.
- `blocked_ips`: exact staging Cloud SQL, Redis, and private service IPs.
- `runtime_class`: `gvisor`.

The workflow sets `RUNTIME_E2E_SKIP_KIND=1` and
`RUNTIME_E2E_SKIP_IMAGE_BUILD=1`, so it validates the real staging cluster
instead of a local kind image.

---

## Step 7 - End-to-end on staging (30 min)

```bash
PLAYWRIGHT_BASE_URL=https://staging.YOUR_DOMAIN pnpm test:e2e
```

Six specs (1500+ test runs across chromium / tablet / mobile) including:

- Login + signup
- AI-created project boots the agent with a default model
- Project preview boots a real app and renders inside the webview
- All IDE service panels open in light + dark modes
- Responsive desktop / tablet / mobile shells
- Theme tokens applied to public + admin + IDE

Acceptance: all six specs pass on all three projects.

---

## Step 8 - Manual product drills (½ day)

Tick the checklist in `GO_LIVE_CHECKLIST.md` sections **Runtime Gates**
(lines 39-52) and **Product Gates** (lines 53-69). Concretely:

1. Sign up + verify email + reset password.
2. Enrol MFA + use a recovery code.
3. Sign in with Google, GitHub, OIDC, SAML (using the providers you configured).
4. Create a project from blank, from template, from import (GitHub).
5. Open the IDE, edit a file, run a command, open the terminal WebSocket.
6. Detect a port and open the preview URL with TLS.
7. Stop / restart / delete the workspace; verify PVC persistence.
8. Wait for idle GC to sleep an inactive workspace.
9. Invite a collaborator, verify presence + cursor + comments + terminal RBAC.

---

## Step 9 - Billing drills (½ day)

```bash
brew install stripe/stripe-cli/stripe
stripe login
stripe listen --forward-to https://staging.YOUR_DOMAIN/api/billing/webhook
```

In a second terminal:

```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger invoice.payment_succeeded
stripe trigger invoice.payment_failed
```

Verify in the database that each event creates a `BillingEvent`, that the
event handler is idempotent (replay the same event-id → no duplicate row),
and that quotas reflect the new plan.

---

## Step 10 - Load tests (1 day)

```bash
brew install k6

K6_BASE=https://staging.YOUR_DOMAIN
k6 run tests/load/api-load.js                -e BASE_URL=$K6_BASE
k6 run tests/load/workspace-lifecycle-load.js -e BASE_URL=$K6_BASE
k6 run tests/load/preview-load.js             -e BASE_URL=$K6_BASE
k6 run tests/load/ai-simulated-load.js        -e BASE_URL=$K6_BASE
k6 run tests/load/billing-webhook-load.js     -e BASE_URL=$K6_BASE
```

Targets are documented in `docs/LOAD_TESTING.md`. Verify Prometheus is
scraping, Grafana dashboards are imported, alert rules are loaded, and a
Sentry-compatible reporter receives a probe event.

---

## Step 11 - DR + rollback drill (½ day)

```bash
# Encrypted project backup restore dry run
pnpm sre:validate

# Real Cloud SQL point-in-time-recovery drill (in staging)
gcloud sql backups list --instance=vibecore-staging
gcloud sql instances clone vibecore-staging vibecore-staging-restore \
  --point-in-time="$(date -u -v-1H +%Y-%m-%dT%H:%M:%S.000Z)"

# Rollback exercise
helm rollback platform 0 -n vibecore
helm rollback workspaces-runtime 0 -n workspaces
```

Acceptance: cloned instance is reachable, application reaches `RUNNING` after
rollback, no user-visible errors during the swap.

---

## Step 12 - External security review (planned, before paid launch)

Engage an external pen-tester. At minimum:

- OWASP Top 10 against the app + admin
- RBAC bypass tests using the matrix in `docs/AUTH_RBAC.md`
- Org isolation: cross-tenant project access attempts
- Path traversal: file-server endpoints in `services/api/src/app.ts`
- Command injection: `runtime/commands` and AI-tool endpoints
- Webhook signature replay
- SSRF through git clone / preview iframe

Acceptance: written report with no Critical or High findings, or all fixed
before launch.

---

## Step 13 - Continuous validation

```bash
# Schedule a recurring agent (offered by Claude Code)
/schedule production:validate:live every Monday 06:00 UTC, alert on failure
```

This keeps the readiness gate green as secrets rotate every
`SECRET_ROTATION_CADENCE_DAYS`.
