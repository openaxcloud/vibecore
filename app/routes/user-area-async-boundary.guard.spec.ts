import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CRITICAL_USER_AREA_ROUTES = [
  'account-settings.tsx',
  'api-keys.tsx',
  'billing.tsx',
  'dashboard.tsx',
  'dashboard_.templates.tsx',
  'invoices.tsx',
  'notifications.tsx',
  'organization-members.tsx',
  'projects._index.tsx',
  'recent-projects.tsx',
  'security-settings.tsx',
  'support.tsx',
  'usage.tsx',
] as const;

const PROJECT_PANEL_ROUTES = [
  'projects.$projectId._index.tsx',
  'projects.$projectId.activity.tsx',
  'projects.$projectId.collaborators.tsx',
  'projects.$projectId.database.tsx',
  'projects.$projectId.deployments.tsx',
  'projects.$projectId.domains.tsx',
  'projects.$projectId.env.tsx',
  'projects.$projectId.logs.tsx',
  'projects.$projectId.secrets.tsx',
  'projects.$projectId.settings.tsx',
  'projects.$projectId.snapshots.tsx',
] as const;

describe('user-area async route recovery guard', () => {
  it('keeps every critical non-IDE route behind the recoverable user-area boundary', () => {
    for (const route of [...CRITICAL_USER_AREA_ROUTES, ...PROJECT_PANEL_ROUTES]) {
      const source = readFileSync(join(process.cwd(), 'app/routes', route), 'utf8');

      expect(source, route).toContain(
        "export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';",
      );
    }
  });

  it('keeps the IDE route outside this visual recovery batch', () => {
    expect(PROJECT_PANEL_ROUTES).not.toContain('projects.$projectId.ide.tsx');
  });
});
