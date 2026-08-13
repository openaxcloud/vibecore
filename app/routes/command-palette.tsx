import type { MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';
import { AppShell, CommandPalettePreview, type ProjectCard } from '~/components/dashboard/SaaSLayout';
import { toProjectCards, type ApiProject } from '~/lib/dashboard-projects';
import { apiRequest, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

type Organization = { id: string; slug?: string };

export async function loader({ request }: EnterpriseLoaderArgs) {
  const orgs = await apiRequest<{ organizations: Organization[] }>(request, '/orgs');
  const organization = orgs.organizations[0];

  if (!organization) {
    return { projects: [] satisfies ProjectCard[] };
  }

  const result = await apiRequest<{ projects: ApiProject[] }>(request, `/orgs/${organization.id}/projects`);

  const projects = Array.isArray(result?.projects) ? result.projects : [];

  return { projects: toProjectCards(projects, organization) };
}

export const meta: MetaFunction = () => [{ title: 'Command palette - E-Code' }];

export default function CommandPalettePage() {
  const { projects } = useLoaderData<typeof loader>();

  return (
    <AppShell
      title="Command palette"
      description="Keyboard-first navigation for projects, billing, support, imports and IDE actions."
    >
      <CommandPalettePreview projects={projects} />
    </AppShell>
  );
}
