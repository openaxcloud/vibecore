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
    expect(projects).toContain("t('projects.loadFailedTitle')");
    expect(projects).toContain('onRetry={revalidator.revalidate}');
  });

  it('distinguishes unavailable optional billing, usage and notification data from real zero states', () => {
    const billing = source('app/routes/billing.tsx');
    const usage = source('app/routes/usage.tsx');
    const notifications = source('app/routes/notifications.tsx');

    expect(billing).toContain('creditsUnavailable');
    expect(billing).toContain("t('billing.credits.errorTitle')");
    expect(usage).toContain('breakdownUnavailable');
    expect(usage).toContain('memberLimitsUnavailable');
    expect(notifications).toContain('feedUnavailable');
    expect(notifications).toContain("t('notifications.feed.loadErrorTitle')");
  });

  it('never guesses account security state after a failed read', () => {
    const security = source('app/routes/security-settings.tsx');
    const organizationSecurity = source('app/routes/organization-security.tsx');
    const sessions = source('app/routes/session-security.tsx');

    expect(security).toContain('mfaUnavailable');
    expect(security).toContain("copy['securitySettings.mfa.errorTitle']");
    expect(security).toContain("copy['securitySettings.mfa.errorDescription']");
    expect(security).toContain('onRetry={revalidator.revalidate}');
    expect(organizationSecurity).toContain('loadErrorKind');
    expect(organizationSecurity).toContain("copy['organizationSecurity.load.errorTitle']");
    expect(organizationSecurity).toContain("copy['organizationSecurity.load.errorDescription']");
    expect(organizationSecurity).toContain('onRetry={revalidator.revalidate}');
    expect(sessions).toContain('sessionsUnavailable');
    expect(sessions).toContain("copy['sessionSecurity.sessions.errorTitle']");
    expect(sessions).toContain("copy['sessionSecurity.sessions.errorDescription']");
    expect(sessions).toContain('onRetry={revalidator.revalidate}');
  });

  it('times out and exposes retry for the global notification panel', () => {
    const layout = source('app/components/dashboard/SaaSLayout.tsx');

    expect(layout).toContain('TOP_BAR_FEED_TIMEOUT_MS = 12_000');
    expect(layout).toContain("phase: 'loading' | 'ready' | 'error'");
    expect(layout).toContain("t('userArea.notifications.loadFailed')");
    expect(layout).toContain('onRetry={retry}');
  });

  it('keeps support, invoice and recent-project failures distinct from empty states', () => {
    const support = source('app/routes/support.tsx');
    const invoices = source('app/routes/invoices.tsx');
    const recentProjects = source('app/routes/recent-projects.tsx');

    expect(support).toContain("copy['support.load.errorTitle']");
    expect(support).toContain("copy['support.load.errorDescription']");
    expect(support).toContain('onRetry={revalidator.revalidate}');
    expect(invoices).toContain('invoicesUnavailable');
    expect(invoices).toContain("'invoices.errorTitle'");
    expect(invoices).toContain('onRetry={revalidator.revalidate}');
    expect(recentProjects).toContain('projectsUnavailable');
    expect(recentProjects).toContain("t('recentProjects.loadFailedTitle')");
    expect(recentProjects).toContain('onRetry={revalidator.revalidate}');
  });

  it('loads desktop settings explicitly and recovers without exposing bridge errors', () => {
    const desktop = source('app/routes/desktop-settings.tsx');

    expect(desktop).toContain("type DesktopSettingsPhase = 'checking' | 'ready' | 'unavailable' | 'error'");
    expect(desktop).toContain("copy['desktopSettings.loading.label']");
    expect(desktop).toContain("copy['desktopSettings.error.title']");
    expect(desktop).toContain('onRetry={() => void loadDesktopSettings()}');
  });

  it('hides domain and SIEM controls instead of rendering false empty states after failed reads', () => {
    const domains = source('app/routes/organization-domains.tsx');
    const siem = source('app/routes/organization-siem.tsx');

    expect(domains).toContain("copy['organizationDomains.load.errorTitle']");
    expect(domains).toContain('onRetry={revalidator.revalidate}');
    expect(domains).toContain("copy['organizationDomains.load.errorDescription']");
    expect(siem).toContain("copy['organizationSiem.load.errorTitle']");
    expect(siem).toContain('onRetry={revalidator.revalidate}');
    expect(siem).toContain("copy['organizationSiem.load.errorDescription']");
  });

  it('hides audit exports and the false empty state when the audit list fails', () => {
    const auditLogs = source('app/routes/audit-logs.tsx');

    expect(auditLogs).toContain("copy['auditLogs.load.errorTitle']");
    expect(auditLogs).toContain("copy['auditLogs.load.errorDescription']");
    expect(auditLogs).toContain('onRetry={revalidator.revalidate}');
    expect(auditLogs).toContain("listErrorKind: 'permission' as const");
    expect(auditLogs).toContain('if (isReauthRedirect(error))');
  });

  it('hides member and account-data controls when their authoritative reads fail', () => {
    const members = source('app/routes/organization-members.tsx');
    const accountData = source('app/routes/account-settings.data.tsx');

    expect(members).toContain("copy['organizationMembers.load.errorTitle']");
    expect(members).toContain("copy['organizationMembers.load.permissionDescription']");
    expect(members).toContain('onRetry={revalidator.revalidate}');
    expect(members).toContain('if (isReauthRedirect(error))');
    expect(accountData).toContain('copy.load.errorTitle');
    expect(accountData).toContain('copy.load.errorDescription');
    expect(accountData).toContain('onRetry={revalidator.revalidate}');
    expect(accountData).toContain('formatAccountDataDate(');
    expect(accountData).not.toContain("new Intl.DateTimeFormat('en-GB'");
    expect(accountData).not.toContain('toLocaleString(undefined');
  });
});
