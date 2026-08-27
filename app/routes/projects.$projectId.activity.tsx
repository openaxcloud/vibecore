import { Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';
import { ActivityList, ProjectShell } from '~/components/dashboard/SaaSLayout';
import type { EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import {
  getProjectDashboardActivityCopy,
  projectActivityActionLabel,
} from '~/lib/i18n/catalogs/project-dashboard-activity';
import { normalizeSupportedLanguage } from '~/lib/i18n/language';
import { formatUserAreaDateTime } from '~/lib/i18n/user-area-locale';
import { projectPageLoader } from '~/lib/project-route.server';

type ActivityData = { activity: Array<{ id: string; action: string; createdAt?: string; metadata?: unknown }> };

export const meta: MetaFunction<typeof loader> = ({ data, matches, params }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = data?.language ?? rootData?.language;
  const copy = getProjectDashboardActivityCopy(language);
  const title = copy['projectActivity.meta.title'];
  const description = copy['projectActivity.meta.description'];
  const canonical = `https://e-code.ai/projects/${encodeURIComponent(params.projectId ?? '')}/activity`;
  const french = normalizeSupportedLanguage(language) === 'fr';

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: canonical },
    { property: 'og:locale', content: french ? 'fr_FR' : 'en_US' },
    { property: 'og:locale:alternate', content: french ? 'en_US' : 'fr_FR' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { tagName: 'link', rel: 'canonical', href: canonical },
    { tagName: 'link', rel: 'alternate', hrefLang: 'en', href: `${canonical}?lang=en` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'fr', href: `${canonical}?lang=fr` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: canonical },
  ];
};
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';
export const loader = (args: EnterpriseLoaderArgs) =>
  projectPageLoader<ActivityData>(args, (projectId) => `/projects/${projectId}/activity`);

export default function ProjectActivityPage() {
  const { project, data } = useLoaderData<typeof loader>();
  const { i18n } = useTranslation();
  const language = normalizeSupportedLanguage(i18n.resolvedLanguage ?? i18n.language) ?? 'en';
  const copy = getProjectDashboardActivityCopy(language);

  return (
    <ProjectShell
      projectId={project.id}
      title={copy['projectActivity.page.title']}
      description={copy['projectActivity.page.description']}
    >
      <ActivityList
        items={
          data.activity?.length
            ? data.activity.map((event) => {
                const parsed = event.createdAt ? new Date(event.createdAt) : null;

                const detail = parsed
                  ? (formatUserAreaDateTime(parsed, undefined, language) ?? copy['projectActivity.recorded'])
                  : copy['projectActivity.recorded'];

                return {
                  title: projectActivityActionLabel(event.action, language),
                  detail,
                  icon: Activity,
                };
              })
            : [
                {
                  title: copy['projectActivity.empty.title'],
                  detail: copy['projectActivity.empty.detail'],
                  icon: Activity,
                },
              ]
        }
      />
    </ProjectShell>
  );
}
