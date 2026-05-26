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
