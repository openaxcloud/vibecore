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

  it('keeps support, invoice and recent-project failures distinct from empty states', () => {
    const support = source('app/routes/support.tsx');
    const invoices = source('app/routes/invoices.tsx');
    const recentProjects = source('app/routes/recent-projects.tsx');

    expect(support).toContain('Support tickets could not load');
    expect(support).toContain('onRetry={revalidator.revalidate}');
    expect(invoices).toContain('invoicesUnavailable');
    expect(invoices).toContain('Invoices could not load');
    expect(invoices).toContain('onRetry={revalidator.revalidate}');
    expect(recentProjects).toContain('projectsUnavailable');
    expect(recentProjects).toContain('Recent projects could not load');
    expect(recentProjects).toContain('onRetry={revalidator.revalidate}');
  });

  it('loads desktop settings explicitly and recovers without exposing bridge errors', () => {
    const desktop = source('app/routes/desktop-settings.tsx');

    expect(desktop).toContain("type DesktopSettingsPhase = 'checking' | 'ready' | 'unavailable' | 'error'");
    expect(desktop).toContain('<AsyncPanelSkeleton label="Loading desktop settings"');
    expect(desktop).toContain('Desktop settings could not load');
    expect(desktop).toContain('onRetry={() => void loadDesktopSettings()}');
  });

  it('hides domain and SIEM controls instead of rendering false empty states after failed reads', () => {
    const domains = source('app/routes/organization-domains.tsx');
    const siem = source('app/routes/organization-siem.tsx');

    expect(domains).toContain('Domains could not load');
    expect(domains).toContain('onRetry={revalidator.revalidate}');
    expect(domains).toContain('Domain controls are hidden because the latest request failed.');
    expect(siem).toContain('SIEM webhooks could not load');
    expect(siem).toContain('onRetry={revalidator.revalidate}');
    expect(siem).toContain('Webhook controls are hidden because the latest request failed.');
  });

  it('hides audit exports and the false empty state when the audit list fails', () => {
    const auditLogs = source('app/routes/audit-logs.tsx');

    expect(auditLogs).toContain('Audit logs could not load');
    expect(auditLogs).toContain('Events and exports are hidden because the latest request failed.');
    expect(auditLogs).toContain('onRetry={revalidator.revalidate}');
    expect(auditLogs).toContain("listErrorKind: 'permission' as const");
    expect(auditLogs).toContain('if (isReauthRedirect(error))');
  });

  it('hides member and account-data controls when their authoritative reads fail', () => {
    const members = source('app/routes/organization-members.tsx');
    const accountData = source('app/routes/account-settings.data.tsx');

    expect(members).toContain('Members could not load');
    expect(members).toContain('Invitations and member controls are hidden.');
    expect(members).toContain('onRetry={revalidator.revalidate}');
    expect(members).toContain('if (isReauthRedirect(error))');
    expect(accountData).toContain('Data and privacy settings could not load');
    expect(accountData).toContain('exports, and deletion controls are hidden');
    expect(accountData).toContain('onRetry={revalidator.revalidate}');
    expect(accountData).toContain("new Intl.DateTimeFormat('en-GB'");
    expect(accountData).not.toContain('toLocaleString(undefined');
  });
});
