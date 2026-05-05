# SLOs

## API Availability

- Target: 99.9% monthly successful API requests.
- Indicator: `1 - api_errors_total / api_requests_total`.
- Alert: `APIHighErrorRate`.

## API Latency

- Target: p95 below 1s and p99 below 3s.
- Indicator: `api_request_duration_seconds`.
- Alert: `APIHighP95Latency`.

## Workspace Start Success

- Target: 99% successful workspace starts.
- Indicator: `workspace_failures_total / workspace_starts_total`.
- Alert: `WorkspaceStartFailures`.

## Workspace Start Latency

- Target: p95 below 60s.
- Indicator: `workspace_start_latency_seconds`.
- Alert: `WorkspaceStartP95Latency`.

## Preview Availability

- Target: 99.5% successful preview requests.
- Indicator: preview proxy success rate and `preview_requests_total`.
- Alert: synthetic preview failures and preview 5xx rate.

## AI Response Availability

- Target: 99% successful AI gateway responses.
- Indicator: `ai_provider_errors_total` by provider and `ai_provider_latency_seconds`.
- Alert: `AIProviderErrors`.

## Billing Webhook Processing

- Target: 99.99% accepted signed Stripe webhooks with idempotent processing.
- Indicator: `stripe_webhook_failures_total`.
- Alert: `StripeWebhookFailures`.
