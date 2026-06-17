import { Building2, Plus } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';
import { ActivityList, AppShell, LinkButton } from '~/components/dashboard/SaaSLayout';
import { apiRequest, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

export const meta: MetaFunction = () => [{ title: 'Organizations - VibeCore' }];

type Organization = { id: string; name?: string; slug?: string };

export async function loader({ request }: EnterpriseLoaderArgs) {
  const result = await apiRequest<{ organizations: Organization[] }>(request, '/orgs');
  return { organizations: result.organizations };
}

export default function OrganizationSwitcherPage() {
  const { organizations } = useLoaderData<typeof loader>();

  return (
    <AppShell
      title="Organization switcher"
      description="Switch between organizations and their isolated projects, billing and RBAC settings."
      actions={<LinkButton to="/onboarding">New organization</LinkButton>}
    >
      <ActivityList
        items={
          organizations.length
            ? organizations.map((organization, index) => ({
                title: organization.name ?? organization.slug ?? organization.id,
                detail:
                  index === 0
                    ? 'Current organization loaded from the backend session.'
                    : 'Available organization loaded from backend membership.',
                icon: Building2,
              }))
            : [
                {
                  title: 'No organizations',
                  detail: 'Create an organization to isolate projects, billing and RBAC.',
                  icon: Plus,
                },
              ]
        }
      />
    </AppShell>
  );
}
