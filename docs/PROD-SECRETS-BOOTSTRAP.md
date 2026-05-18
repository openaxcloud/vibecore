# Production secrets bootstrap

State of GCP Secret Manager `vibecore-prod-*` as of **2026-05-18**, plus
the runbook to sync them into the K8s `Secret/vibecore-platform-secrets`
that every deployment consumes.

## What's already filled

19/20 `vibecore-prod-*` secrets have an enabled version (audited live,
not from docs): database URL, Redis URL (Memorystore
`redis://10.237.0.4:6379`), JWT/cookie/encryption/workspace-agent
secrets, backup encryption key, SIEM signing secret, Google/GitHub
OAuth client IDs and secrets, OpenAI/Gemini/Moonshot/xAI API keys,
Stripe secret key + webhook secret, Sentry DSN.

The 20th secret — `vibecore-prod-anthropic-api-key` — is the only
hard-empty one. The platform boots without it because other AI
providers cover the validator's `requiredAny`.

> The `JWT_SECRET` (vibecore-prod-jwt-secret) was empty on 2026-05-18
> and re-generated then (64-byte hex) as part of Phase 0. If any prior
> deployment minted JWTs against an older value, those sessions are no
> longer valid — users will need to log back in. Rotation cadence is
> tracked under `SECRET_ROTATION_OWNER` / `SECRET_ROTATION_CADENCE_DAYS`.

## Quick audit

```bash
for s in \
  vibecore-prod-database-url vibecore-prod-redis-url \
  vibecore-prod-jwt-secret vibecore-prod-cookie-secret \
  vibecore-prod-encryption-key vibecore-prod-workspace-agent-token-secret \
  vibecore-prod-backup-encryption-key vibecore-prod-siem-signing-secret \
  vibecore-prod-google-client-id vibecore-prod-google-client-secret \
  vibecore-prod-github-client-id vibecore-prod-github-client-secret \
  vibecore-prod-openai-api-key vibecore-prod-anthropic-api-key \
  vibecore-prod-google-gemini-api-key vibecore-prod-xai-api-key \
  vibecore-prod-moonshot-api-key \
  vibecore-prod-stripe-secret-key vibecore-prod-stripe-webhook-secret \
  vibecore-prod-sentry-dsn
do
  c=$(gcloud secrets versions list "$s" --project=vibecore-495216 --filter="state:ENABLED" --format="value(name)" 2>/dev/null | wc -l | tr -d ' ')
  [ "$c" = "0" ] && echo "  MISSING: $s" || echo "  ok ($c): $s"
done
```

## Add the missing one — Anthropic API key

Get a key from <https://console.anthropic.com/settings/keys>. Use a
dedicated production key so it can be rotated independently of dev.

```bash
printf '%s' 'sk-ant-PASTE_HERE' | gcloud secrets versions add \
  vibecore-prod-anthropic-api-key --project=vibecore-495216 --data-file=-
```

## Sync GCP Secret Manager → K8s Secret

Use the committed script (zero-leak: never prints values to stdout):

```bash
# Refresh cluster credentials + add your IP to the master authorized network
gcloud container clusters get-credentials vibecore-prod-app \
  --region europe-west9 --project vibecore-495216
MY_IP=$(curl -s ifconfig.me)
gcloud container clusters update vibecore-prod-app \
  --region europe-west9 --project vibecore-495216 \
  --enable-master-authorized-networks \
  --master-authorized-networks "${MY_IP}/32"

# Show keys (values redacted) so you can sanity-check the mapping:
./scripts/sync-k8s-secret-from-gcp.sh --dry-run

# Apply for real, then rolling-restart every deployment:
./scripts/sync-k8s-secret-from-gcp.sh --restart
```

The script pulls the 20 mapped secrets, plus 8 static config entries
(`NODE_ENV=production`, `VITE_RUNTIME_MODE=remote-kubernetes`,
`WORKSPACE_MANAGER_URL=https://workspace-manager.e-code.ai`, etc.) into
a transient file `chmod 600`, applies the Secret, and `shred`s the
file. Any missing secret prints a `WARNING` but does not abort —
`vibecore-prod-anthropic-api-key` is expected to be the only one until
you fill it.

## Helm deploy

A7 hardened `values-prod.yaml` so an un-overridden `imageTag` fails
fast. The deploy script enforces an immutable SHA-pinned tag:

```bash
# Build first: push main to the build branch so .github/workflows/docker.yml
# produces tagged images:
git push origin main:product/saas-platform-production

# Then deploy the current HEAD's SHA:
./scripts/deploy-prod.sh
# or pin to a specific previous tag:
./scripts/deploy-prod.sh sha-ef77d35

# Pre-flight only:
./scripts/deploy-prod.sh --dry-run
```

The script refuses to deploy if any of the 8 images
(`web admin api worker ai-gateway workspace-manager workspace-agent
preview-proxy`) doesn't have the target SHA tag in Artifact Registry,
and runs `pnpm synthetic:health` against `https://app.e-code.ai`
post-rollout. On failure it prints the rollback command.

## What's still needed beyond Phase 0 to pass `production:validate --strict`

These are **non-blocking for the platform booting**, but the
production validator is strict. Each gap = Phase 1 work:

| Gap | Why it fails | Phase |
|-----|--------------|-------|
| OIDC (Microsoft Entra) | 8 envs missing | Phase 1 — SSO |
| SAML metadata or X509 cert | provider set incomplete | Phase 1 — SSO |
| Transactional email (SMTP or Resend) | no provider set | Phase 1 — Email |
| `SIEM_WEBHOOK_URL` | empty | Phase 1 — Audit immutable |
| `STRIPE_FREE_*` + `STRIPE_ENTERPRISE_PRODUCT_ID` | missing | Phase 1 — Stripe catalog |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | empty | Phase 1 — Observability |
| `INCIDENT_WEBHOOK_URL` | empty | Phase 1 — Incident response |
| `SOC2_EVIDENCE_BUCKET` | empty | Phase 1 — Compliance |
| `SECURITY_CONTACT_EMAIL` | empty | trivial — set in GitHub Variables |

Until those land, deploy uses `production:validate` (non-strict) which
only checks core secrets + ingress reachability.
