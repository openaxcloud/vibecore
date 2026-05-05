# Load Testing

Load tests live in `tests/load` and are written for k6.

## Install

```bash
brew install k6
```

or use Docker:

```bash
docker run --rm -i grafana/k6 run - < tests/load/api-load.js
```

## API Load

```bash
BASE_URL=https://staging.example.com k6 run tests/load/api-load.js
```

## Workspace Lifecycle Load

```bash
BASE_URL=https://staging.example.com AUTH_TOKEN=token k6 run tests/load/workspace-lifecycle-load.js
```

## Preview Load

```bash
PREVIEW_URL=https://workspace.preview.staging.example.com k6 run tests/load/preview-load.js
```

## AI Simulated Load

```bash
BASE_URL=https://staging.example.com AUTH_TOKEN=token k6 run tests/load/ai-simulated-load.js
```

## Billing Webhook Load

Use only test webhook secrets and staging endpoints.

```bash
BASE_URL=https://staging.example.com STRIPE_TEST_SIGNATURE=sig k6 run tests/load/billing-webhook-load.js
```

## Thresholds

Default thresholds assert low error rates and bounded p95/p99 latency. Tune `K6_VUS` and `K6_DURATION` per environment.
