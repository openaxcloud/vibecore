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

    expect(usage).toContain('quotaDisplayLabel(quota)');
    expect(usage).toContain('quotaDisplayLabel(override.key)');
    expect(usage).not.toContain('\n                        {quota}\n');
    expect(usage).not.toContain('>{override.key}<');
    expect(support).toContain('statusDisplayLabel(ticket.status)');
    expect(supportTicket).toContain('statusDisplayLabel(ticket.status)');
    expect(organizationMembers).toContain('{memberRoleLabel}');
    expect(organizationMembers).not.toContain('\n                    {member.roleKey}\n');
    expect(organizationInvitations).toContain('{roleLabel(invite.roleKey)}');
    expect(pendingInvitations).toContain("userFacingLabel(invite.roleKey, 'Member')");
  });

  it('does not expose implementation-oriented copy on primary user surfaces', () => {
    const sources = [
      source('app/routes/usage.tsx'),
      source('app/routes/invoices.tsx'),
      source('app/routes/support.tsx'),
      source('app/routes/organization-members.tsx'),
      source('app/routes/organization-roles.tsx'),
    ].join('\n');

    expect(sources).not.toMatch(/backend-enforced|stored in the backend|verified Stripe webhooks/iu);
  });

  it('does not reveal raw route errors or claim that credit packs never expire', () => {
    const projectsNew = source('app/routes/projects.new.tsx');
    const billing = source('app/routes/billing.tsx');

    expect(projectsNew).not.toContain('<summary>Technical details</summary>');
    expect(projectsNew).not.toContain('{descriptor.detail}');
    expect(billing).not.toContain("'No expiry'");
    expect(billing).toContain('Expiration date unavailable');
  });

  it('uses labelled permission controls instead of requiring API permission keys', () => {
    const roles = source('app/routes/roles-and-permissions.tsx');

    expect(roles).toContain('permissionLabel(permission)');
    expect(roles).toContain('selectedPermissions.join');
    expect(roles).not.toContain('placeholder="projects:read,usage:read"');
    expect(roles).not.toContain("role.permissions.join(', ')");
  });

  it('humanizes project, deployment and conversation statuses before rendering', () => {
    const projectCards = source('app/components/dashboard/SaaSLayout.tsx');
    const projects = source('app/routes/projects._index.tsx');
    const database = source('app/routes/projects.$projectId.database.tsx');
    const deployments = source('app/routes/projects.$projectId.deployments.tsx');
    const sharedConversation = source('app/routes/share.$token.tsx');

    expect(projectCards).toContain("statusDisplayLabel(project.status ?? 'Ready')");
    expect(projects).toContain("statusDisplayLabel(project.status ?? 'Ready')");
    expect(database).toContain('statusDisplayLabel(status)');
    expect(deployments).toContain('statusDisplayLabel(status)');
    expect(sharedConversation).toContain('MESSAGE_ROLE_LABELS[message.role]');
    expect(sharedConversation).not.toContain('>{message.role}<');
  });
});
