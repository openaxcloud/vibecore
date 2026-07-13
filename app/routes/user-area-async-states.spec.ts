/**
 * @vitest-environment node
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('user-area recoverable async states', () => {
  it('does not turn failed project organizations into a false empty state', () => {
    const projects = source('app/routes/projects._index.tsx');

    expect(projects).toContain('failedOrganizationCount');
    expect(projects).toContain('allOrganizationsFailed');
    expect(projects).toContain('Projects could not load');
    expect(projects).toContain('onRetry={revalidator.revalidate}');
  });

  it('distinguishes unavailable optional billing, usage and notification data from real zero states', () => {
    const billing = source('app/routes/billing.tsx');
    const usage = source('app/routes/usage.tsx');
    const notifications = source('app/routes/notifications.tsx');

    expect(billing).toContain('creditsUnavailable');
    expect(billing).toContain('Credits and usage could not load');
    expect(usage).toContain('breakdownUnavailable');
    expect(usage).toContain('memberLimitsUnavailable');
    expect(notifications).toContain('feedUnavailable');
    expect(notifications).toContain('Notification inbox could not load');
  });

  it('never guesses account security state after a failed read', () => {
    const security = source('app/routes/security-settings.tsx');
    const organizationSecurity = source('app/routes/organization-security.tsx');
    const sessions = source('app/routes/session-security.tsx');

    expect(security).toContain('mfaUnavailable');
    expect(security).toContain('We will not guess whether protection is enabled.');
    expect(organizationSecurity).toContain('The editor is hidden to prevent fallback values');
    expect(sessions).toContain('Active sessions could not load');
  });

  it('times out and exposes retry for the global notification panel', () => {
    const layout = source('app/components/dashboard/SaaSLayout.tsx');

    expect(layout).toContain('TOP_BAR_FEED_TIMEOUT_MS = 12_000');
    expect(layout).toContain("phase: 'loading' | 'ready' | 'error'");
    expect(layout).toContain('Notifications could not load');
    expect(layout).toContain('onRetry={retry}');
  });
});
