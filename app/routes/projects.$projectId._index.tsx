import { Activity, FileCode2, GitBranch, MonitorPlay, Rocket } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { useLoaderData } from 'react-router';
import { ActivityList, ProjectShell, StatGrid } from '~/components/dashboard/SaaSLayout';
import type { EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { projectPageLoader, type ProjectRecord } from '~/lib/project-route.server';

type DashboardData = {
  project: ProjectRecord;
  workspace: { id: string; status: string; runtimeMode: string } | null;
  files: Array<{ path: string }>;
  git: { branch?: string; changedFiles?: string[]; ahead?: number; behind?: number };
  recentActivity: Array<{ id: string; action: string; createdAt?: string }>;
};

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? `${data.project.name} - E-Code` : 'Project - E-Code' },
];
export const loader = (args: EnterpriseLoaderArgs) =>
  projectPageLoader<DashboardData>(args, (projectId) => `/projects/${projectId}/dashboard`);

export default function ProjectDashboardPage() {
  const { project, data } = useLoaderData<typeof loader>();
  const workspaceStatus = data.workspace?.status ?? 'Not started';
  const branch = data.git?.branch ?? project.gitDefaultBranch ?? 'main';

  return (
    <ProjectShell
      projectId={project.id}
      title={project.name}
      description={project.description ?? 'Persistent Bolt project backed by the production API.'}
    >
      <div className="grid gap-6">
        <StatGrid
          stats={[
            {
              label: 'Workspace',
              value: workspaceStatus,
              detail: data.workspace ? `Runtime: ${data.workspace.runtimeMode}` : 'No workspace session recorded',
              icon: MonitorPlay,
            },
            {
              label: 'Branch',
              value: branch,
              detail: `${data.git?.ahead ?? 0} ahead, ${data.git?.behind ?? 0} behind`,
              icon: GitBranch,
            },
            {
              label: 'Files',
              value: String(data.files.length),
              detail: 'Loaded from persistent project storage',
              icon: FileCode2,
            },
            {
              label: 'Activity',
              value: String(data.recentActivity.length),
              detail: 'Project events from audit-visible activity log',
              icon: Activity,
            },
          ]}
        />
        <ActivityList
          items={
            data.recentActivity.length
              ? data.recentActivity.map((item) => ({
                  title: item.action,
                  detail: item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Recorded by API',
                  icon: Activity,
                }))
              : [
                  {
                    title: 'No project activity yet',
                    detail: 'Create a snapshot, edit settings or open the IDE to generate real activity.',
                    icon: Rocket,
                  },
                ]
          }
        />
      </div>
    </ProjectShell>
  );
}
