import type { MetaFunction } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import { Activity } from 'lucide-react';
import { ActivityList, ProjectShell } from '~/components/dashboard/SaaSLayout';
import { projectPageLoader } from '~/lib/project-route.server';
import type { EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

type ActivityData = { activity: Array<{ id: string; action: string; createdAt?: string; metadata?: unknown }> };

export const meta: MetaFunction = () => [{ title: 'Project activity - VibeCore' }];
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
          data.activity.length
            ? data.activity.map((event) => ({
                title: event.action,
                detail: event.createdAt ? new Date(event.createdAt).toLocaleString() : 'Recorded by API',
                icon: Activity,
              }))
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
