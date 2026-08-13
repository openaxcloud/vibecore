import { Activity } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';
import { ActivityList, ProjectShell } from '~/components/dashboard/SaaSLayout';
import type { EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { formatUserAreaDateTime } from '~/lib/i18n/user-area-locale';
import { projectPageLoader } from '~/lib/project-route.server';

type ActivityData = { activity: Array<{ id: string; action: string; createdAt?: string; metadata?: unknown }> };

export const meta: MetaFunction = () => [{ title: 'Project activity - E-Code' }];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';
export const loader = (args: EnterpriseLoaderArgs) =>
  projectPageLoader<ActivityData>(args, (projectId) => `/projects/${projectId}/activity`);

export default function ProjectActivityPage() {
  const { project, data } = useLoaderData<typeof loader>();

  return (
    <ProjectShell
      projectId={project.id}
      title="Project activity"
      description="Review imports, snapshots, Git operations, collaborator changes and runtime events."
    >
      <ActivityList
        items={
          data.activity?.length
            ? data.activity.map((event) => {
                const parsed = event.createdAt ? new Date(event.createdAt) : null;

                const detail = parsed ? (formatUserAreaDateTime(parsed) ?? 'Activity recorded') : 'Activity recorded';

                return {
                  title: event.action,
                  detail,
                  icon: Activity,
                };
              })
            : [
                {
                  title: 'No activity yet',
                  detail: 'Project actions will appear here after API writes.',
                  icon: Activity,
                },
              ]
        }
      />
    </ProjectShell>
  );
}
