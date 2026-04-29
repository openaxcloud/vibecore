import type { MetaFunction } from '@remix-run/cloudflare';
import { Building2, Plus } from 'lucide-react';
import { ActivityList, AppShell, LinkButton } from '~/components/dashboard/SaaSLayout';

export const meta: MetaFunction = () => [{ title: 'Organizations - VibeCore' }];

export default function OrganizationSwitcherPage() {
  return (
    <AppShell
      title="Organization switcher"
      description="Switch between organizations and their isolated projects, billing and RBAC settings."
      actions={<LinkButton to="/onboarding">New organization</LinkButton>}
    >
      <ActivityList
        items={[
          {
            title: 'Acme Workspace',
            detail: 'Current organization. Team plan, 6 members, shared billing enabled.',
            icon: Building2,
          },
          {
            title: 'Personal Sandbox',
            detail: 'Free plan workspace for experiments and public templates.',
            icon: Plus,
          },
        ]}
      />
    </AppShell>
  );
}
