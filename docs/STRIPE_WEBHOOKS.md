# Stripe Webhooks

Endpoint:

`POST /billing/stripe/webhook`

Required environment:

- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY`
- Stripe price IDs for plan mapping

## Security

The API captures the raw request body and validates the `Stripe-Signature` header with HMAC SHA-256. Invalid, missing or expired signatures are rejected before persistence.

## Idempotency

Every Stripe event ID is inserted into `StripeEvent`. Replayed events return `{ received: true, duplicate: true }` and do not re-run subscription changes.

## Events

Handled events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.finalized`
- `invoice.payment_failed`

Subscription plan mapping uses the Stripe price ID from the event payload and the seeded `Plan` table.
