import { Activity, FileCode2, GitBranch, MonitorPlay, Rocket } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';
import { ActivityList, ProjectShell, StatGrid } from '~/components/dashboard/SaaSLayout';
import type { EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { formatAbsoluteTime } from '~/lib/format-relative';
import {
  formatProjectDashboardActivityCopy,
  getProjectDashboardActivityCopy,
  projectActivityActionLabel,
  projectWorkspaceStatusLabel,
} from '~/lib/i18n/catalogs/project-dashboard-activity';
import { normalizeSupportedLanguage } from '~/lib/i18n/language';
import { formatUserAreaNumber } from '~/lib/i18n/user-area-locale';
import { projectPageLoader, type ProjectRecord } from '~/lib/project-route.server';

export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

type DashboardData = {
  project: ProjectRecord;
  workspace: { id: string; status: string; runtimeMode: string } | null;
  files: Array<{ path: string }>;
  git: { branch?: string; changedFiles?: string[]; ahead?: number; behind?: number };
  recentActivity: Array<{ id: string; action: string; createdAt?: string }>;
};

export const meta: MetaFunction<typeof loader> = ({ data, matches, params }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = data?.language ?? rootData?.language;
  const copy = getProjectDashboardActivityCopy(language);
  const title = data ? `${data.project.name} - E-Code` : copy['projectDashboard.meta.fallbackTitle'];
  const description = copy['projectDashboard.meta.description'];
  const canonical = `https://e-code.ai/projects/${encodeURIComponent(params.projectId ?? '')}`;
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
export const loader = (args: EnterpriseLoaderArgs) =>
  projectPageLoader<DashboardData>(args, (projectId) => `/projects/${projectId}/dashboard`);

export default function ProjectDashboardPage() {
  const { project, data } = useLoaderData<typeof loader>();
  const { i18n } = useTranslation();
  const language = normalizeSupportedLanguage(i18n.resolvedLanguage ?? i18n.language) ?? 'en';
  const copy = getProjectDashboardActivityCopy(language);
  const workspaceStatus = projectWorkspaceStatusLabel(data.workspace?.status, language);
  const branch = data.git?.branch ?? project.gitDefaultBranch ?? 'main';
  const files = data.files ?? [];
  const recentActivity = data.recentActivity ?? [];
  const ahead = formatUserAreaNumber(data.git?.ahead ?? 0, undefined, language);
  const behind = formatUserAreaNumber(data.git?.behind ?? 0, undefined, language);

  return (
    <ProjectShell
      projectId={project.id}
      title={project.name}
      description={project.description ?? copy['projectDashboard.page.defaultDescription']}
    >
      <div className="grid gap-6">
        <StatGrid
          stats={[
            {
              label: copy['projectDashboard.stat.workspace'],
              value: workspaceStatus,
              detail: data.workspace
                ? formatProjectDashboardActivityCopy(copy['projectDashboard.workspace.runtime'], {
                    mode: data.workspace.runtimeMode,
                  })
                : copy['projectDashboard.workspace.noSession'],
              icon: MonitorPlay,
            },
            {
              label: copy['projectDashboard.stat.branch'],
              value: branch,
              detail: formatProjectDashboardActivityCopy(copy['projectDashboard.branch.sync'], { ahead, behind }),
              icon: GitBranch,
            },
            {
              label: copy['projectDashboard.stat.files'],
              value: formatUserAreaNumber(files.length, undefined, language),
              detail: copy['projectDashboard.files.detail'],
              icon: FileCode2,
            },
            {
              label: copy['projectDashboard.stat.activity'],
              value: formatUserAreaNumber(recentActivity.length, undefined, language),
              detail: copy['projectDashboard.activity.detail'],
              icon: Activity,
            },
          ]}
        />
        <ActivityList
          items={
            recentActivity.length
              ? recentActivity.map((item) => ({
                  title: projectActivityActionLabel(item.action, language),
                  detail: item.createdAt
                    ? formatAbsoluteTime(item.createdAt, language) || copy['projectDashboard.activity.recorded']
                    : copy['projectDashboard.activity.recorded'],
                  icon: Activity,
                }))
              : [
                  {
                    title: copy['projectDashboard.empty.title'],
                    detail: copy['projectDashboard.empty.detail'],
                    icon: Rocket,
                  },
                ]
          }
        />
      </div>
    </ProjectShell>
  );
}
