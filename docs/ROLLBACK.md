# Rollback

## Platform Helm Rollback

```bash
gcloud container clusters get-credentials PROD_APP_CLUSTER --region REGION --project PROJECT
helm history vibecore -n vibecore
helm rollback vibecore LAST_GOOD_REVISION -n vibecore
pnpm synthetic:health
```

The production deploy workflow prints the same rollback command before and after deployment.

## Image Rollback

Deploy the previous immutable image tag:

```bash
helm upgrade --install vibecore infra/helm/platform \
  --namespace vibecore \
  --atomic \
  --set global.imageTag=PREVIOUS_GOOD_TAG
```

## Database Rollback

Prefer forward fixes. If data restoration is required, use Cloud SQL PITR:

```bash
gcloud sql backups list --instance vibecore-prod-postgres --project PROJECT
gcloud sql instances clone vibecore-prod-postgres vibecore-prod-restore --point-in-time "YYYY-MM-DDTHH:MM:SSZ" --project PROJECT
```

Never run destructive migrations without a backup verification pass and an incident commander approval.

## Workspace Runtime Rollback

```bash
gcloud container clusters get-credentials PROD_WORKSPACES_CLUSTER --region REGION --project PROJECT
helm history workspaces -n workspaces
helm rollback workspaces LAST_GOOD_REVISION -n workspaces
```

## External provider rollback recovery

Rollback requests for production deployments on Vercel, Netlify, or Cloudflare
Pages require `Idempotency-Key`. Safe Vercel and Cloudflare Pages mutations are
recorded in the durable `RollbackIdempotencyRequest` ledger. The API writes
`DISPATCHING` before the provider POST, so `DISPATCHING`, `AMBIGUOUS`, and
`MANUAL_RECOVERY` all mean that the provider effect may already have been
accepted. Never repeat the POST, delete the rollback row, or attempt to clean
up an accepted traffic switch.

Use the provider's live routing authority, not the original HTTP response:

- Netlify: GET the bound Site, require both Site and published-deploy site IDs
  to match, compare `published_deploy.id` with the bound deploy, then GET the
  complete `/traffic_splits` collection. Any active Split Test, malformed test
  identity/state, or present pagination `Link` response is ambiguous because
  CDN traffic may still be divided across branch deploys. Even when those
  checks agree, Netlify's public API does not expose an exhaustive authority
  proving that Skew Protection cannot route pinned requests to an older deploy.
  The API therefore rejects a new Netlify rollback with
  `PROVIDER_ROLLBACK_LIVE_STATE_UNPROVABLE`/503 before provider inspection,
  ledger creation, or POST. This prevents an accepted effect from becoming an
  unresolvable `IN_PROGRESS` row that permanently blocks project/account purge.
  Historical provider-effect rows, if any, remain fail-closed; they cannot be
  terminalized from Site plus Split Test evidence.
- Cloudflare Pages: GET the Project and compare
  `result.canonical_deployment.id` with the bound deployment. The Project name
  and immutable Project ID, plus the canonical deployment project ID/name and
  production environment, must all agree with the original deployment binding.
- Vercel: GET the bound Project and inspect `lastAliasRequest`; require
  `skewProtectionMaxAge` to be exactly `0`; require
  `GET /v1/projects/{project}/rolling-release?state=ACTIVE` to report no active
  Rolling Release; then list the complete verified production-domain set and
  GET every alias. Repeat the domain enumeration and every alias lookup, then
  confirm the Project and Rolling Release authority are unchanged. A matching
  alias mutation whose `jobStatus` is `pending` or `in-progress` remains
  ambiguous, regardless of mutation type or target, even while aliases still
  serve another deployment. A target mutation that is `failed` or `skipped`
  can support non-target proof; an absent or different completed last alias
  request must additionally pass the three-minute activity-quiescence horizon.
  Every alias `deploymentId`, `alias`, and `projectId` must then agree with its
  bound lookup. Both pagination cursors must explicitly be null and the page
  count must equal the returned domain set. An empty or incomplete domain set,
  an active Rolling Release, a missing/malformed project or alias result, or
  mixed deployment IDs, enabled/unknown Skew Protection, or a change between
  the two observation passes is ambiguous. Vercel has no transactional routing
  snapshot or equivalent project-level canonical deployment field in this
  workflow. The double-read detects changes during the observation window but
  cannot make several provider GETs atomic; a project without exact,
  skew-disabled production-alias configuration must remain fail-closed.

The supported operator action is
`POST /admin/provider-rollbacks/:operationId/recovery` with a strict
`{"mfaCode":"CURRENT_TOTP_OR_RECOVERY_CODE"}` JSON body. It requires a
platform-admin session, a current MFA proof, and password/IdP reauthentication
within 60 seconds. The MFA requirement cannot be disabled by
`ADMIN_MFA_REQUIRED`. The endpoint itself performs the live GET; it does not
accept caller-supplied provider evidence and contains no provider POST path.

- For a provider whose public API exposes exhaustive authority (Cloudflare
  Pages, and Vercel only with the strict skew-disabled checks above), if every
  live authority serves the exact target, the API commits only the local
  Deployment/receipt under a newly acquired project release fence. A changed
  manifest or lost fence leaves the operation recoverable.
- For those same provable authorities, if exact authority serves only another
  non-target deployment, run the operator action again after its `retryAt`.
  Terminal `SUPERSEDED` requires two contiguous exact observations by the same
  operator, separated by at least 60 seconds according to the database clock,
  with no ambiguous observation in the window. It writes a failed/superseded
  receipt and never sends another POST.
- If authority is missing, mixed, paginated, malformed, or unavailable, the
  operation remains `MANUAL_RECOVERY` and the endpoint returns 503. Escalate the
  provider/configuration incident; do not force a terminal state or mutate the
  ledger with direct SQL.

Every terminal operator resolution writes an `AuditLog` entry linked to the
operator, tenant, rollback operation, evidence window, and resolution. Project
hard-delete and account purge refuse before their first physical effect while
any rollback is `IN_PROGRESS`, including pre-dispatch and manual-recovery rows.
They become eligible again only after the normal target commit or an audited
`SUPERSEDED` resolution completes the ledger.
