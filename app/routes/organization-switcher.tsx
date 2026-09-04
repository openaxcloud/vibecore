import { Building2, Plus } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';
import { ActivityList, AppShell } from '~/components/dashboard/SaaSLayout';
import { apiRequest, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { buildOrganizationRows, type Organization } from '~/lib/organizations';

export const meta: MetaFunction = () => [{ title: 'Organizations - E-Code' }];

export async function loader({ request }: EnterpriseLoaderArgs) {
  const result = await apiRequest<{ organizations: Organization[] }>(request, '/orgs');
  return { organizations: result.organizations };
}

export default function OrganizationSwitcherPage() {
  const { organizations } = useLoaderData<typeof loader>();

  return (
    <AppShell
      title="Organizations"
      description="The organizations you belong to, each with isolated projects, billing and RBAC settings."
    >
      <ActivityList
        items={buildOrganizationRows(organizations).map((row) => ({
          ...row,
          icon: organizations.length ? Building2 : Plus,
        }))}
      />
    </AppShell>
  );
}
