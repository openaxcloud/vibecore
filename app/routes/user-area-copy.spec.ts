/**
 * @vitest-environment node
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('user-area product vocabulary', () => {
  it('renders quota and support identifiers through the product-label catalog', () => {
    const usage = source('app/routes/usage.tsx');
    const support = source('app/routes/support.tsx');
    const supportTicket = source('app/routes/support_.$id.tsx');
    const organizationMembers = source('app/routes/organization-members.tsx');
    const organizationInvitations = source('app/routes/organization-invitations.tsx');
    const pendingInvitations = source('app/components/dashboard/PendingInvitationsSection.tsx');

    expect(usage).toContain("label(quota, 'billing.label.planAllowance')");
    expect(usage).toContain("label(override.key, 'billing.label.planAllowance')");
    expect(usage).toContain('memberLabel(member, memberIndex)');
    expect(usage).not.toContain('\n                        {quota}\n');
    expect(usage).not.toContain('>{override.key}<');
    expect(usage).not.toContain('m.email || m.name || m.userId');
    expect(support).toContain('supportTicketStatusLabel(ticket.status, language)');
    expect(supportTicket).toContain('supportTicketDetailStatusLabel(ticket.status, language)');
    expect(organizationMembers).toContain('{memberRoleLabel}');
    expect(organizationMembers).not.toContain('\n                    {member.roleKey}\n');
    expect(organizationInvitations).toContain('{roleLabel(invite.roleKey)}');
    expect(pendingInvitations).toContain('organizationMemberRoleLabel(invite.roleKey, undefined, copy)');
  });

  it('does not expose implementation-oriented copy on primary user surfaces', () => {
    const sources = [
      source('app/routes/usage.tsx'),
      source('app/routes/invoices.tsx'),
      source('app/routes/support.tsx'),
      source('app/routes/invitations.tsx'),
      source('app/routes/session-security.tsx'),
      source('app/routes/enterprise-sso-settings.tsx'),
      source('app/routes/organization-members.tsx'),
      source('app/routes/organization-invitations.tsx'),
      source('app/routes/organization-roles.tsx'),
      source('app/routes/organization-domains.tsx'),
      source('app/routes/organization-security.tsx'),
      source('app/routes/organization-siem.tsx'),
      source('app/routes/roles-and-permissions.tsx'),
      source('app/routes/scim-token-settings.tsx'),
      source('app/routes/audit-logs.tsx'),
      source('app/routes/quota-exceeded.tsx'),
      source('app/routes/mobile-workspace.$projectId.tsx'),
      source('app/routes/account-settings.connected.tsx'),
      source('app/routes/integrations.oauth.$provider.callback.tsx'),
      source('app/routes/desktop-settings.tsx'),
      source('app/routes/login.tsx'),
    ].join('\n');

    expect(sources).not.toMatch(
      /backend-enforced|stored in the backend|verified Stripe webhooks|Organization ID|Role key|HTTP \$\{response\.status\}|Technical details/iu,
    );

    const siem = source('app/routes/organization-siem.tsx');
    const auditLogs = source('app/routes/audit-logs.tsx');
    expect(siem).not.toContain('This requires the audit:export permission.');
    expect(auditLogs).not.toContain('for the audit:export permission.');
  });

  it('does not reveal raw route errors or claim that credit packs never expire', () => {
    const projectsNew = source('app/routes/projects.new.tsx');
    const billing = source('app/routes/billing.tsx');
    const invoices = source('app/routes/invoices.tsx');

    expect(projectsNew).not.toContain('<summary>Technical details</summary>');
    expect(projectsNew).not.toContain('{descriptor.detail}');
    expect(billing).not.toContain("'No expiry'");
    expect(billing).toContain("t('billing.packs.expiryUnavailable')");
    expect(invoices).toContain('invoice.currency');
    expect(invoices).toContain('formatInvoiceAmount(');
    expect(invoices).not.toContain("currency: 'EUR'");
  });

  it('uses labelled permission controls instead of requiring API permission keys', () => {
    const roles = source('app/routes/roles-and-permissions.tsx');

    expect(roles).toContain('permissionLabel(permission, language)');
    expect(roles).toContain('selectedPermissions.join');
    expect(roles).not.toContain('placeholder="projects:read,usage:read"');
    expect(roles).not.toContain("role.permissions.join(', ')");
  });

  it('humanizes project and deployment statuses before rendering', () => {
    const projectCards = source('app/components/dashboard/SaaSLayout.tsx');
    const projects = source('app/routes/projects._index.tsx');
    const recentProjects = source('app/routes/recent-projects.tsx');
    const database = source('app/routes/projects.$projectId.database.tsx');
    const deployments = source('app/routes/projects.$projectId.deployments.tsx');

    expect(projectCards).toContain('localizedProjectStatus(project, t)');
    expect(projects).toContain('<ProjectStatusPill project={project} />');
    expect(projects).toContain('stack: projectStackLabel(project, language)');
    expect(recentProjects).toContain('stack: projectStackLabel(project, language)');
    expect(projects).not.toContain('stack: project.gitRepositoryUrl ?? project.sourceType');
    expect(recentProjects).not.toContain('stack: project.gitRepositoryUrl ?? project.sourceType');
    expect(database).toContain('databaseRestoreStatusLabel(status, copy)');
    expect(deployments).toContain('copy.statuses.unknown');
  });

  it('does not render audit identifiers or OAuth query details as customer copy', () => {
    const auditLogs = source('app/routes/audit-logs.tsx');
    const login = source('app/routes/login.tsx');
    const connectedAccounts = source('app/routes/account-settings.connected.tsx');
    const organizationMembers = source('app/routes/organization-members.tsx');

    expect(auditLogs).toContain('auditActionLabel(row.action, language)');
    expect(auditLogs).toContain('auditResourceLabel(row.resourceType, language)');
    expect(auditLogs).not.toContain("{row.actorUserId ?? '—'}");
    expect(auditLogs).not.toContain('Organization <span className="font-mono">{orgId}</span>');
    expect(login).toContain('oauthErrorTranslationKey(loaderData.oauth.error)');
    expect(login).not.toContain('loaderData.oauth.detail ?');
    expect(connectedAccounts).toContain('connectedAccountOauthError(linkErrorDetail');
    expect(connectedAccounts).not.toContain('state.result.errorMessage');
    expect(connectedAccounts).not.toContain('parsed.error ??');
    expect(organizationMembers).toContain("copy['organizationMembers.members.fallbackIndexed']");
    expect(organizationMembers).not.toContain('member.userName ?? member.userEmail ?? member.userId');

    const integrationCallback = source('app/routes/integrations.oauth.$provider.callback.tsx');
    const desktopSettings = source('app/routes/desktop-settings.tsx');
    const desktopActions = source('app/lib/desktop-settings-actions.ts');

    expect(integrationCallback).toContain('oauthErrorDisplayMessage(outcome.errorCode ?? outcome.errorMessage)');
    expect(integrationCallback).not.toContain('Code: {outcome.errorCode');
    expect(integrationCallback).not.toContain("{outcome.errorMessage ?? 'The provider could not complete");
    expect(desktopSettings).not.toMatch(
      /Electron preload API|safeStorage-backed session|View raw|Hide raw|JSON\.stringify\(settings\.devicePolicy/,
    );
    expect(desktopActions).not.toContain('error.message');
    expect(desktopActions).not.toContain('String(error)');
  });
});
