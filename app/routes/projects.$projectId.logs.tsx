import type { MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';
import { ProjectShell } from '~/components/dashboard/SaaSLayout';
import type { EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { projectPageLoader } from '~/lib/project-route.server';

type DashboardData = {
  workspace: { id: string; status: string; runtimeMode: string; updatedAt?: string } | null;
  recentActivity: Array<{ id: string; action: string; createdAt?: string }>;
};

export const meta: MetaFunction = () => [{ title: 'Project logs - E-Code' }];
export const loader = (args: EnterpriseLoaderArgs) =>
  projectPageLoader<DashboardData>(args, (projectId) => `/projects/${projectId}/dashboard`);

export default function ProjectLogsPage() {
  const { project, data } = useLoaderData<typeof loader>();

  const lines = [
    data.workspace
      ? `workspace:${data.workspace.id} status=${data.workspace.status} runtime=${data.workspace.runtimeMode}`
      : 'workspace:none recorded for this project',
    ...data.recentActivity.map((event) => `${event.createdAt ?? 'recorded'} ${event.action}`),
  ];

  return (
    <ProjectShell
      projectId={project.id}
      title="Logs"
      description="Workspace and project activity logs from real backend records."
    >
      <div className="overflow-x-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 font-mono text-xs text-bolt-elements-textSecondary">
        {/* Log lines are frequently identical; index-qualify the key so duplicate lines don't collide. */}
        {lines.map((line, index) => (
          <div key={`${index}-${line}`} className="whitespace-pre-wrap break-all">
            {line}
          </div>
        ))}
      </div>
    </ProjectShell>
  );
}
