import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';
import { AppShell, CommandPalettePreview, type ProjectCard } from '~/components/dashboard/SaaSLayout';
import { toProjectCards, type ApiProject } from '~/lib/dashboard-projects';
import { apiRequest, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { userAreaEn, userAreaFr } from '~/lib/i18n/catalogs/user-area';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';

type Organization = { id: string; slug?: string };

export async function loader({ request }: EnterpriseLoaderArgs) {
  const { language } = resolveRequestLocale(request);
  const orgs = await apiRequest<{ organizations: Organization[] }>(request, '/orgs');
  const organization = orgs.organizations[0];

  if (!organization) {
    return { language, projects: [] satisfies ProjectCard[] };
  }

  const result = await apiRequest<{ projects: ApiProject[] }>(request, `/orgs/${organization.id}/projects`);

  const projects = Array.isArray(result?.projects) ? result.projects : [];

  return { language, projects: toProjectCards(projects, organization, 6, language) };
}

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: (data?.language === 'fr' ? userAreaFr : userAreaEn)['commandPalette.metaTitle'] },
];

export default function CommandPalettePage() {
  const { t } = useTranslation();
  const { projects } = useLoaderData<typeof loader>();

  return (
    <AppShell title={t('commandPalette.title')} description={t('commandPalette.description')}>
      <CommandPalettePreview projects={projects} />
    </AppShell>
  );
}
