import type { MetaFunction } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';
import { ProjectShell } from '~/components/dashboard/SaaSLayout';
import { projectPageLoader } from '~/lib/project-route.server';
import type { EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

type DashboardData = {
  workspace: { id: string; status: string; runtimeMode: string; updatedAt?: string } | null;
  recentActivity: Array<{ id: string; action: string; createdAt?: string }>;
};

export const meta: MetaFunction = () => [{ title: 'Project logs - VibeCore' }];
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
      <div className="rounded-lg border border-bolt-elements-borderColor bg-black p-4 font-mono text-xs text-green-200">
        {lines.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    </ProjectShell>
  );
}
