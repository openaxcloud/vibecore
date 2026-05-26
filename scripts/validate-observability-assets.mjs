#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const dashboardPath = join(root, 'infra/observability/grafana/vibecore-platform-dashboard.json');
const alertsPath = join(root, 'infra/observability/prometheus/alert-rules.yaml');
const syntheticPath = join(root, 'infra/observability/synthetics/health-check.json');

const dashboard = JSON.parse(readFileSync(dashboardPath, 'utf8'));
const synthetic = JSON.parse(readFileSync(syntheticPath, 'utf8'));
const alerts = readFileSync(alertsPath, 'utf8');

const requiredMetrics = [
  'api_request_duration_seconds',
  'api_errors_total',
  'auth_failures_total',
  'db_latency_seconds',
  'redis_latency_seconds',
  'queue_depth',
  'job_failures_total',
  'workspace_starts_total',
  'workspace_start_latency_seconds',
  'workspace_failures_total',
  'active_workspaces',
  'terminal_sessions',
  'preview_requests_total',
  'ai_tokens_total',
  'ai_provider_latency_seconds',
  'ai_provider_errors_total',
  'stripe_webhook_failures_total',
  'abuse_events_total',
  'kubernetes_pod_failures_total',
  'node_pool_capacity',
  'pvc_usage_bytes',
  'storage_usage_bytes',
  'project_archive_objects_total',
  'project_archive_bytes_total',
  'project_snapshot_restore_fallbacks_total',
  'project_snapshot_restore_failures_total',
  'cost_estimate_cents',
];

if (dashboard.title !== 'VibeCore Platform SRE') {
  throw new Error('Dashboard title mismatch');
}
if (!Array.isArray(dashboard.panels) || dashboard.panels.length < 8) {
  throw new Error('Dashboard must include SRE panels');
}
if (!Array.isArray(synthetic.checks) || synthetic.checks.length < 4) {
  throw new Error('Synthetic checks are incomplete');
}

for (const metric of requiredMetrics) {
  if (!dashboardIncludes(dashboard, metric) && !alerts.includes(metric)) {
    throw new Error(`Metric ${metric} is not represented by dashboards or alerts`);
  }
}

for (const alert of [
  'APIHighErrorRate',
  'WorkspaceStartFailures',
  'AIProviderErrors',
  'StripeWebhookFailures',
  'ProjectSnapshotRestoreFailures',
  'BackupRestoreDryRunFailed',
  'SyntheticHealthCheckFailed',
]) {
  if (!alerts.includes(`alert: ${alert}`)) {
    throw new Error(`Missing alert rule ${alert}`);
  }
}

console.log('observability assets valid');

function dashboardIncludes(value, needle) {
  return JSON.stringify(value).includes(needle);
}
