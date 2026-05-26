# Observability

VibeCore exposes OpenTelemetry traces, structured JSON logs, Prometheus metrics, Sentry-compatible error reporting, dashboards, alert rules, and synthetic checks.

## Tracing

`services/api/src/server.ts` starts OpenTelemetry through `services/api/src/telemetry.ts`. Configure:

- `OTEL_ENABLED=true`
- `OTEL_SERVICE_NAME=vibecore-api`
- `OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.example.com/v1/traces`

Node auto-instrumentations cover HTTP, Fastify, PostgreSQL/Prisma, Redis, and outbound provider calls where supported.

## Logs

API logs are structured JSON with:

- `requestId`
- `correlationId`
- `userId`
- `organizationId`
- `projectId`
- status code and duration

Secrets, cookies, tokens, and passwords are redacted before logs are emitted.

## Metrics

The API exposes Prometheus metrics at `/metrics`. Workspace agents expose Prometheus metrics at `/metrics` with agent-token auth.

Core metrics include:

- `api_request_duration_seconds`
- `api_requests_total`
- `api_errors_total`
- `auth_failures_total`
- `db_latency_seconds`
- `redis_latency_seconds`
- `queue_depth`
- `job_failures_total`
- `workspace_starts_total`
- `workspace_start_latency_seconds`
- `workspace_failures_total`
- `active_workspaces`
- `terminal_sessions`
- `preview_requests_total`
- `ai_tokens_total`
- `ai_provider_latency_seconds`
- `ai_provider_errors_total`
- `stripe_webhook_failures_total`
- `abuse_events_total`
- `kubernetes_pod_failures_total`
- `node_pool_capacity`
- `pvc_usage_bytes`
- `storage_usage_bytes`
- `project_archive_objects_total`
- `project_archive_bytes_total`
- `project_snapshot_restore_fallbacks_total`
- `project_snapshot_restore_failures_total`
- `cost_estimate_cents`

## Dashboards And Alerts

- Grafana dashboard: `infra/observability/grafana/vibecore-platform-dashboard.json`
- Prometheus alert rules: `infra/observability/prometheus/alert-rules.yaml`

Validate assets with:

```bash
pnpm sre:validate
```

## Error Reporting

Set `SENTRY_INGEST_URL` or `SENTRY_DSN` to enable Sentry-compatible JSON error event delivery for 5xx API errors.

## Synthetic Checks

Synthetic check definition: `infra/observability/synthetics/health-check.json`.

Run locally against an API instance:

```bash
SYNTHETIC_BASE_URL=http://127.0.0.1:3001 pnpm synthetic:health
```
