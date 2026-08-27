# Production secrets bootstrap

This is the runbook for the production secret and provider gaps
identified by `pnpm run production:validate --strict`. The platform may
compile, typecheck and test green on `main`, but production deploy must
stay blocked until every required value has an enabled version in GCP
Secret Manager or a real production GitHub Environment variable.

The platform K8s Secret `vibecore-platform-secrets` (defined in
`infra/helm/platform/values-prod.yaml`) is hydrated from these GCP
Secret Manager entries. You will need a `gcloud` session authenticated
against `vibecore-495216`.

```bash
gcloud auth login
gcloud config set project vibecore-495216
```

---

## Quick check — what's currently empty

Run this before you start. Anything reported as `NO ENABLED VERSION`
or with a placeholder value needs to be set below.

```bash
for s in \
  vibecore-prod-anthropic-api-key \
  vibecore-prod-redis-url \
  vibecore-prod-stripe-free-product-id \
  vibecore-prod-stripe-free-price-id \
  vibecore-prod-stripe-enterprise-product-id \
  vibecore-prod-preview-proxy-shared-secret \
  vibecore-prod-smtp-host \
  vibecore-prod-otel-endpoint \
  vibecore-prod-incident-webhook-url
do
  ver=$(gcloud secrets versions list "$s" --filter="state:ENABLED" --format="value(name)" --limit=1 2>/dev/null | head -1)
  if [ -z "$ver" ]; then
    echo "  MISSING: $s"
  else
    echo "  ok:      $s (v$ver)"
  fi
done
```

The `vibecore-prod-redis-url` secret already points to
`redis://10.237.0.4:6379` (Memorystore) — verified `2026-05-18`. If
this changes you'll need to add an AUTH password to the URL when
Memorystore AUTH is enabled in Phase 1.

---

## A3 — Anthropic API key

Get a key from <https://console.anthropic.com/settings/keys>. Use a
dedicated key for prod (so it can be rotated independently of dev). The
secret `vibecore-prod-anthropic-api-key` already exists with no enabled
version — just add one.

```bash
printf '%s' 'sk-ant-PASTE_HERE' | gcloud secrets versions add \
  vibecore-prod-anthropic-api-key --data-file=-
```

---

## A4 — Transactional email

Two valid shapes; pick one.

### Option A — SMTP (Mailgun, Postmark, etc.)

```bash
printf '%s' 'smtp.mailgun.org'         | gcloud secrets versions add vibecore-prod-smtp-host    --data-file=- 2>/dev/null \
  || gcloud secrets create vibecore-prod-smtp-host  --data-file=- < <(printf '%s' 'smtp.mailgun.org')
printf '%s' '587'                       | gcloud secrets versions add vibecore-prod-smtp-port    --data-file=- 2>/dev/null \
  || gcloud secrets create vibecore-prod-smtp-port  --data-file=- < <(printf '%s' '587')
printf '%s' 'postmaster@e-code.ai'      | gcloud secrets versions add vibecore-prod-smtp-user    --data-file=- 2>/dev/null \
  || gcloud secrets create vibecore-prod-smtp-user  --data-file=- < <(printf '%s' 'postmaster@e-code.ai')
printf '%s' 'PASTE_SMTP_PASSWORD'       | gcloud secrets versions add vibecore-prod-smtp-password --data-file=- 2>/dev/null \
  || gcloud secrets create vibecore-prod-smtp-password --data-file=- < <(printf '%s' 'PASTE_SMTP_PASSWORD')
```

Plus a `vars` entry in GitHub for `SMTP_FROM=no-reply@e-code.ai` and
`EMAIL_FROM=no-reply@e-code.ai` (referenced by `.github/workflows/deploy-prod.yml`).

### Option B — Resend HTTP API (recommended for low setup cost)

1. Buy/transfer `e-code.ai` DNS to your Resend domain set (Resend
   dashboard prints the required MX/SPF/DKIM/DMARC TXT records — add
   them to the Cloud DNS zone `e-code-ai`).
2. Generate a domain-scoped API key.

```bash
printf '%s' 'https://api.resend.com/emails'         | gcloud secrets versions add vibecore-prod-email-http-endpoint --data-file=- 2>/dev/null \
  || gcloud secrets create vibecore-prod-email-http-endpoint --data-file=- < <(printf '%s' 'https://api.resend.com/emails')
printf '%s' 're_PASTE_RESEND_KEY'                   | gcloud secrets versions add vibecore-prod-email-http-token    --data-file=- 2>/dev/null \
  || gcloud secrets create vibecore-prod-email-http-token --data-file=- < <(printf '%s' 're_PASTE_RESEND_KEY')
```

---

## A5 — Stripe catalog IDs (free + enterprise)

The PRO and TEAM tiers already have product/price IDs in
`.env.production`. Free + Enterprise need to be created in
<https://dashboard.stripe.com/products>:

1. **Free** — recurring $0/mo, name "VibeCore Free". Copy the
   `prod_…` and `price_…` IDs.
2. **Enterprise** — recurring custom price (or $1, the seat count is
   gated by RBAC, not Stripe). Copy `prod_…` (the `price_…` is already
   in `.env.production`).

```bash
gcloud secrets create vibecore-prod-stripe-free-product-id        --data-file=- < <(printf '%s' 'prod_PASTE_FREE')
gcloud secrets create vibecore-prod-stripe-free-price-id          --data-file=- < <(printf '%s' 'price_PASTE_FREE')
gcloud secrets create vibecore-prod-stripe-enterprise-product-id  --data-file=- < <(printf '%s' 'prod_PASTE_ENT')
```

Then run `pnpm run stripe:seed` once with these values in the env to
make sure the Postgres `BillingPlan` rows are aligned with the Stripe
catalog.

---

## A6 — OTEL exporter endpoint

Pick a backend (Grafana Cloud, Honeycomb, Datadog, or a self-hosted
Tempo). Each gives you an OTLP HTTP endpoint and a header-based auth
token.

```bash
gcloud secrets create vibecore-prod-otel-endpoint     --data-file=- < <(printf '%s' 'https://otlp.eu.grafana.net/otlp')
gcloud secrets create vibecore-prod-otel-headers      --data-file=- < <(printf '%s' 'Authorization=Basic PASTE_BASE64')
```

Then add a corresponding entry in `.github/workflows/deploy-prod.yml`
under `OTEL_EXPORTER_OTLP_ENDPOINT`, and (optionally)
`OTEL_EXPORTER_OTLP_HEADERS`.

---

## Incident webhook (referenced by `validate-production-enterprise`)

Slack: `Apps → Incoming Webhooks → Add to your channel`. Copy the
`https://hooks.slack.com/services/...` URL.

```bash
gcloud secrets create vibecore-prod-incident-webhook-url \
  --data-file=- < <(printf '%s' 'https://hooks.slack.com/services/PASTE')
```

---

## After every `versions add` — push changes into the K8s secret

The platform reads from a K8s `Secret/vibecore-platform-secrets`. Until
External Secrets Operator is wired (Phase 1), recreate it from the live
SM values and bounce the pods:

```bash
# 1. Pull every secret value into a temp env file (NEVER commit it).
TMP=$(mktemp)
chmod 600 "$TMP"

declare -A MAP=(
  [ANTHROPIC_API_KEY]=vibecore-prod-anthropic-api-key
  [PREVIEW_PROXY_SHARED_SECRET]=vibecore-prod-preview-proxy-shared-secret
  [WORKSPACE_MANAGER_SHARED_SECRET]=vibecore-prod-workspace-manager-shared-secret
  [REDIS_URL]=vibecore-prod-redis-url
  [STRIPE_FREE_PRODUCT_ID]=vibecore-prod-stripe-free-product-id
  [STRIPE_FREE_PRICE_ID]=vibecore-prod-stripe-free-price-id
  [STRIPE_ENTERPRISE_PRODUCT_ID]=vibecore-prod-stripe-enterprise-product-id
  [OTEL_EXPORTER_OTLP_ENDPOINT]=vibecore-prod-otel-endpoint
  [INCIDENT_WEBHOOK_URL]=vibecore-prod-incident-webhook-url
  [EMAIL_HTTP_ENDPOINT]=vibecore-prod-email-http-endpoint
  [EMAIL_HTTP_TOKEN]=vibecore-prod-email-http-token
  [EMAIL_FROM]=vibecore-prod-email-from
)
for k in "${!MAP[@]}"; do
  v=$(gcloud secrets versions access latest --secret="${MAP[$k]}" 2>/dev/null) || continue
  printf '%s=%s\n' "$k" "$v" >> "$TMP"
done

# 2. Patch the platform secret in-place.
kubectl create secret generic vibecore-platform-secrets \
  --namespace=vibecore \
  --from-env-file="$TMP" \
  --dry-run=client -o yaml | kubectl apply -f -

shred -u "$TMP"

# 3. Rolling-restart every deployment that mounts the secret.
kubectl rollout restart deployment -n vibecore \
  --selector app.kubernetes.io/part-of=vibecore
```

Generate `INTERNAL_API_SHARED_SECRET` and `WORKSPACE_MANAGER_SHARED_SECRET`
with at least 32 UTF-8 bytes. The web SSR tier uses this proof for canonical AI
mutations; the API deliberately rejects missing, short or browser-only proofs.

---

## Verification

After the rolling restart, the production validator should pass:

```bash
# From the deploy-prod GitHub Action environment (so env vars are
# populated). Or run locally with `set -a; . ./.env.production; set +a`.
pnpm run production:validate --strict
```

And the live status page at <https://app.e-code.ai/status> (added in
P0.B7) should show every component as `Operational`.
