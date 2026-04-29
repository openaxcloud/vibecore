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

## API

- `GET /orgs/:orgId/billing`
- `POST /orgs/:orgId/billing/checkout`
- `POST /orgs/:orgId/billing/portal`
- `GET /billing/:orgId`
- `POST /billing/stripe/webhook`
- `GET /admin/billing`

Checkout and portal routes call Stripe through `StripeBillingClient`. Webhooks verify the Stripe signature before any subscription or invoice state is persisted.

## Lifecycle

Supported lifecycle events:

- Checkout completed
- Subscription created, updated, deleted
- Invoice paid/finalized/payment failed
- Trial dates
- Cancel at period end
- Upgrade and downgrade through changed Stripe price IDs

Webhook events are idempotent through the `StripeEvent` table.
