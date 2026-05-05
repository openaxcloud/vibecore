import { readFileSync } from 'node:fs';

const source = readFileSync('services/api/src/app.ts', 'utf8');

const adminMutations = [
  { method: 'patch', path: '/admin/users/:userId/platform-admin', action: 'admin.platform_admin.', mfa: true },
  { method: 'post', path: '/admin/abuse-events', action: 'admin.abuse_event.create' },
  { method: 'post', path: '/admin/feature-flags', action: 'admin.feature_flag.upsert' },
  { method: 'post', path: '/admin/system-settings', action: 'admin.system_setting.upsert' },
  { method: 'post', path: '/admin/users/:userId/suspend', action: 'admin.user.suspend' },
  { method: 'post', path: '/admin/users/:userId/unsuspend', action: 'admin.user.unsuspend' },
  { method: 'post', path: '/admin/users/:userId/force-logout', action: 'admin.user.force_logout' },
  { method: 'post', path: '/admin/users/:userId/reset-mfa', action: 'admin.user.reset_mfa', mfa: true },
  { method: 'post', path: '/admin/orgs/:orgId/suspend', action: 'admin.org.suspend' },
  { method: 'post', path: '/admin/workspaces/:workspaceId/stop', action: 'admin.workspace.stop' },
  { method: 'post', path: '/admin/workspaces/:workspaceId/restart', action: 'admin.workspace.restart' },
  { method: 'delete', path: '/admin/workspaces/:workspaceId', action: 'admin.workspace.delete' },
  { method: 'post', path: '/admin/quota-overrides', action: 'admin.quota.override' },
  { method: 'post', path: '/admin/plan-overrides', action: 'admin.plan.override' },
  { method: 'post', path: '/admin/refund-notes', action: 'admin.billing.refund_note' },
  { method: 'post', path: '/admin/logs/redact', action: 'admin.logs.redact' },
  { method: 'post', path: '/admin/abuse-events/:abuseEventId/resolve', action: 'admin.abuse_event.resolve' },
  { method: 'post', path: '/admin/support-tickets/:ticketId/respond', action: 'admin.support.respond' },
  { method: 'post', path: '/admin/maintenance-mode', action: 'admin.maintenance_mode.set' },
  { method: 'post', path: '/admin/announcements', action: 'admin.announcement.set' },
  { method: 'post', path: '/admin/incident-banner', action: 'admin.incident_banner.set' },
];

const routeStarts = [...source.matchAll(/\n\s+app\.(get|post|patch|delete)\('/g)].map((match) => match.index ?? 0);
const failures = [];

for (const mutation of adminMutations) {
  const marker = `app.${mutation.method}('${mutation.path}'`;
  const start = source.indexOf(marker);

  if (start === -1) {
    failures.push(`${mutation.method.toUpperCase()} ${mutation.path}: route not found`);
    continue;
  }

  const nextRoute = routeStarts.find((index) => index > start) ?? source.length;
  const route = source.slice(start, nextRoute);

  if (!route.includes('requirePlatformAdmin(request)') && !route.includes('request.currentUser?.platformAdmin')) {
    failures.push(`${mutation.method.toUpperCase()} ${mutation.path}: missing platform admin guard`);
  }

  if (!route.includes('requireRecentAdminReauth(request')) {
    failures.push(`${mutation.method.toUpperCase()} ${mutation.path}: missing recent admin re-auth guard`);
  }

  if (!route.includes('recordAdminAction(request, store')) {
    failures.push(`${mutation.method.toUpperCase()} ${mutation.path}: missing AdminAuditLog record`);
  }

  if (!route.includes(mutation.action)) {
    failures.push(`${mutation.method.toUpperCase()} ${mutation.path}: missing expected action ${mutation.action}`);
  }

  if (mutation.mfa && !route.includes('requireAdminMfaForSensitiveAction(request)')) {
    failures.push(`${mutation.method.toUpperCase()} ${mutation.path}: missing admin MFA guard`);
  }
}

if (failures.length > 0) {
  console.error('Admin dangerous action validation failed:');
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`admin dangerous action validation passed: ${adminMutations.length} mutations`);
