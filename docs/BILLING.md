# Billing

Billing is enforced in `services/api` and backed by Prisma/PostgreSQL.

## Plans

The authoritative catalog lives in `packages/billing/src/index.ts`:

- Free
- Pro
- Team
- Enterprise

Plans are seeded into the `Plan` table when the API starts. Stripe product and price IDs come from:

- `STRIPE_FREE_PRODUCT_ID`, `STRIPE_FREE_PRICE_ID`
- `STRIPE_PRO_PRODUCT_ID`, `STRIPE_PRO_PRICE_ID`
- `STRIPE_TEAM_PRODUCT_ID`, `STRIPE_TEAM_PRICE_ID`
- `STRIPE_ENTERPRISE_PRODUCT_ID`, `STRIPE_ENTERPRISE_PRICE_ID`

In production, the live Stripe secret key remains in Secret Manager and
the non-secret Product/Price IDs are rendered by the Helm chart from
`infra/helm/platform/values-prod.yaml` at `platformEnv.stripe`. Empty
catalog IDs are intentionally omitted from the ConfigMap so they do not
override a separately managed env source.

Run `pnpm run production:validate:live` before every billing release. The
live validator calls Stripe `/v1/account` with the configured secret key
and fails on expired or invalid keys before Helm rolls new pods.
Use `pnpm run production:validate:live -- --no-dotenv` when checking
values sourced from the live cluster so local `.env` files cannot hide a
missing Stripe catalog variable.

## API

- `GET /orgs/:orgId/billing`
- `POST /orgs/:orgId/billing/checkout`
- `POST /orgs/:orgId/billing/portal`
- `GET /billing/:orgId`
- `POST /billing/stripe/webhook`
- `GET /admin/billing`
- `POST /admin/plan-overrides`
- `POST /admin/quota-overrides`

Checkout and portal routes call Stripe through `StripeBillingClient`. Webhooks verify the Stripe signature before any subscription or invoice state is persisted.

Checkout returns an API 503 when Stripe is not operationally configured:
`STRIPE_NOT_CONFIGURED` for a missing/expired key and
`STRIPE_PRICE_NOT_CONFIGURED` for a plan without a price ID.

## Lifecycle

Supported lifecycle events:

- Checkout completed
- Subscription created, updated, deleted
- Invoice paid/finalized/payment failed
- Trial dates
- Cancel at period end
- Upgrade and downgrade through changed Stripe price IDs

Webhook events are idempotent through the `StripeEvent` table.

## PAYG ledger history and invoice evidence

A `PAYG_CHARGE` ledger entry records a tracked overage; it is not proof that
Stripe issued an invoice or collected payment. The canonical stored reason
`PAYG overage (billed to Stripe metered usage)` is historical system text, not
billing evidence. The API localizes that reason as an overage recorded with
invoicing status unverified, and the billing history uses a neutral recorded
overage label in English and French. Unknown reasons and operator-authored
adjustments remain unchanged.

Historical invoice and payment status remains unknown until independently
reconciled. Neither today's `BILLING_CREDITS_ENABLED`/`BILLING_CREDITS_SHADOW`
flags nor a successful metered-usage report establishes that an invoice was
issued or paid. Use actual invoice/payment records for those conclusions; the
invoice API exposes Stripe invoice status and amounts due/paid. Do not infer
either a charge or a non-charge from the ledger label.

**Unresolved accounting defect:** checkpoint settlement can still append a
`PAYG_CHARGE` in SHADOW mode, and `sumPaygSpendSince()` includes those rows
without a transaction-time shadow/reporting discriminator. The wording fix
does not change amounts, balances, stored reasons or budget calculations, and
does not repair these mixed-status totals. Any accounting follow-up must retain
the audit trail and reconcile historical records using evidence rather than
reclassifying them from current global flags.

Release verification for this correction remains pending:

- [ ] Pass the required native checks for the exact final commit.
- [ ] After deployment, verify existing PAYG rows in English and French on the
      billing page and admin ledger, including desktop, tablet and mobile.
      Confirm the neutral type label/unverified invoice wording, unchanged
      signed amounts and unchanged operator notes.
- [ ] Keep the SHADOW accounting defect open separately until its write path,
      historical provenance and budget totals are tested and reconciled.

## Entitlements

Backend entitlements come from the latest subscription state, not from the frontend.

- `ACTIVE`, `TRIALING` and `PAST_DUE` subscriptions keep their paid plan limits.
- `CANCELED` and `UNPAID` subscriptions fall back to Free plan limits.
- Quota overrides can raise or lower a single quota key and can expire.
- Admin plan overrides require platform admin access and recent re-authentication.

## Admin Billing

`GET /admin/billing` returns configured plans and recent persisted subscriptions. The admin billing UI can:

- inspect real subscription records
- create audited quota overrides
- create audited plan overrides for support or contract corrections

Dangerous admin billing changes are recorded in `AdminAuditLog`.
