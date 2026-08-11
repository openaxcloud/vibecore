import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { useLoaderData, useRevalidator } from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { AppShell, ProjectGrid } from '~/components/dashboard/SaaSLayout';
import { projectStackLabel } from '~/lib/dashboard-project-stack';
import { apiRequest, firstOrganizationOrNull, redirect, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { userAreaEn, userAreaFr } from '~/lib/i18n/catalogs/user-area';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { formatUserAreaDateTime } from '~/lib/i18n/user-area-locale';
import { projectLifecycle, projectLifecycleDisplayLabel } from '~/lib/project-card-presentation';
import { isReauthRedirect } from '~/lib/route-reauth';

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: (data?.language === 'fr' ? userAreaFr : userAreaEn)['recentProjects.metaTitle'] },
];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

type ApiProject = {
  id: string;
  name: string;
  updatedAt?: string;
  sourceType?: string;
  gitRepositoryUrl?: string;
  deploymentCount?: number;
};

export async function loader({ request }: EnterpriseLoaderArgs) {
  const language = resolveRequestLocale(request).language;
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  try {
    const result = await apiRequest<{ projects: ApiProject[] }>(request, `/orgs/${organization.id}/projects`);

    const projects = Array.isArray(result?.projects) ? result.projects : [];

    return {
      projects: projects
        .sort((left, right) => new Date(right.updatedAt ?? 0).getTime() - new Date(left.updatedAt ?? 0).getTime())
        .map((project) => {
          const lifecycle = projectLifecycle(project);

          return {
            id: project.id,
            name: project.name,
            status: projectLifecycleDisplayLabel(lifecycle, language),
            lifecycle,
            deploymentCount: project.deploymentCount,
            updated: project.updatedAt
              ? (formatUserAreaDateTime(project.updatedAt, undefined, language) ??
                (language === 'fr' ? userAreaFr : userAreaEn)['userArea.project.recently'])
              : (language === 'fr' ? userAreaFr : userAreaEn)['userArea.project.recently'],
            updatedAtIso: project.updatedAt,
            stack: projectStackLabel(project, language),
            sourceType: project.sourceType,
            previewImageUrl: `/api/projects/${project.id}/thumbnail`,
          };
        }),
      language,
      projectsUnavailable: false,
    };
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    return { language, projects: [], projectsUnavailable: true };
  }
}

export default function RecentProjectsPage() {
  const { t } = useTranslation();
  const { projects, projectsUnavailable } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const retrying = revalidator.state !== 'idle';

  return (
    <AppShell title={t('recentProjects.title')} description={t('recentProjects.description')}>
      {projectsUnavailable ? (
        retrying ? (
          <AsyncPanelSkeleton label={t('recentProjects.loading')} rows={4} />
        ) : (
          <AsyncPanelError
            title={t('recentProjects.loadFailedTitle')}
            description={t('recentProjects.loadFailedBody')}
            onRetry={revalidator.revalidate}
          />
        )
      ) : (
        <>
          {/* BUG-USR-007: h1→h2→h3 heading order (cards are h3); sr-only. */}
          <h2 className="sr-only">{t('recentProjects.listHeading')}</h2>
          <ProjectGrid projects={projects} />
        </>
      )}
    </AppShell>
  );
}
